import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { quadroEfetivoDaTarefa } from "@/lib/auth/roles";
import { temPermissao } from "@/lib/auth/cargos";
import type { Role, Tarefa } from "@/lib/types";
import {
  NIVEL_POR_QUADRO,
  autenticar,
  camposDeTransferencia,
  lerDataLimite,
  validarDescricaoEDestino,
} from "@/lib/server/tarefasManuais";

export const runtime = "nodejs";

/**
 * Editar/excluir uma tarefa.
 *  - Gerência ("God Mode"): qualquer tarefa, em qualquer status — automática ou avulsa.
 *  - Coordenação: EDITA (descrição, destino, data limite) qualquer tarefa, inclusive as geradas pela
 *    auditoria; excluir continua só com a Gerência.
 *  - Quem criou uma tarefa avulsa: só ela, e a edição só enquanto pendente.
 */
async function carregarTarefa(
  id: string,
  uid: string,
  role: Role,
  acao: "editar" | "excluir"
): Promise<{ ref: FirebaseFirestore.DocumentReference; tarefa: Tarefa; ehGerencia: boolean } | NextResponse> {
  const ref = getAdminDb().collection("tarefas").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ erro: "Tarefa não encontrada." }, { status: 404 });

  const tarefa = snap.data() as Tarefa;
  // "ehGerencia" aqui = edição irrestrita (qualquer status): Gerência e, ao editar, a Coordenação.
  const ehGerencia = role === "gerencia" || (acao === "editar" && role === "coordenador");
  const criadorDaAvulsa = tarefa.origem === "manual" && tarefa.criadaPor === uid;
  if (!ehGerencia && !criadorDaAvulsa) {
    return NextResponse.json(
      {
        erro:
          acao === "editar"
            ? "Somente a Gerência, a Coordenação ou quem criou a tarefa avulsa pode editá-la."
            : "Somente a Gerência, ou quem criou a tarefa avulsa, pode excluí-la.",
      },
      { status: 403 }
    );
  }
  return { ref, tarefa, ehGerencia };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;

    const alvo = await carregarTarefa(params.id, auth.uid, auth.role, "editar");
    if (alvo instanceof NextResponse) return alvo;

    if (!alvo.ehGerencia && alvo.tarefa.status !== "pendente") {
      return NextResponse.json(
        { erro: "Tarefa já concluída — reverta a conclusão antes de editar." },
        { status: 409 }
      );
    }

    const body = (await req.json().catch(() => null)) as {
      descricao?: unknown;
      atribuidoPara?: unknown;
      dataLimite?: unknown;
    } | null;
    const valido = validarDescricaoEDestino(auth.role, body?.descricao, body?.atribuidoPara, quadroEfetivoDaTarefa(alvo.tarefa));
    if (valido instanceof NextResponse) return valido;
    const dataLimite = lerDataLimite(body?.dataLimite);
    if (dataLimite instanceof NextResponse) return dataLimite;

    const manual = alvo.tarefa.origem === "manual";
    const novoQuadro = valido.atribuidoPara;
    const trocouColaborador = novoQuadro !== quadroEfetivoDaTarefa(alvo.tarefa);
    const propria = manual && alvo.tarefa.criadaPor === auth.uid;
    if (trocouColaborador && !propria && !temPermissao(auth.perfil, "transferirTarefas")) {
      return NextResponse.json(
        { erro: "Seu perfil não tem permissão para transferir tarefas de outros colaboradores." },
        { status: 403 }
      );
    }
    await alvo.ref.update({
      descricao: valido.descricao,
      praca: novoQuadro,
      ...(trocouColaborador ? await camposDeTransferencia(novoQuadro) : {}),
      // O nível hierárquico só acompanha o destinatário nas avulsas; as automáticas mantêm o da regra.
      ...(manual ? { nivel: NIVEL_POR_QUADRO[valido.atribuidoPara] } : {}),
      ...(dataLimite !== undefined ? { dataLimite } : {}),
      // Texto de tarefa automática reescrito pela Gerência não é sobrescrito pelas importações.
      ...(!manual && valido.descricao !== alvo.tarefa.descricao ? { descricaoEditada: true } : {}),
      atualizadoEm: new Date().toISOString(),
    });
    return NextResponse.json({ id: params.id });
  } catch (error) {
    console.error("[tarefas/PATCH] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao editar a tarefa.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;

    const alvo = await carregarTarefa(params.id, auth.uid, auth.role, "excluir");
    if (alvo instanceof NextResponse) return alvo;

    // Cascata: leva junto qualquer subcoleção da tarefa, sem deixar documentos órfãos.
    await getAdminDb().recursiveDelete(alvo.ref);
    return NextResponse.json({ id: params.id });
  } catch (error) {
    console.error("[tarefas/DELETE] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao excluir a tarefa.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
