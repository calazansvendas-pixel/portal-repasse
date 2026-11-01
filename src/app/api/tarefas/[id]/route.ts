import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { quadroEfetivoDaTarefa } from "@/lib/auth/roles";
import type { Quadro, Role, Tarefa } from "@/lib/types";
import {
  NIVEL_POR_QUADRO,
  autenticar,
  lerDataLimite,
  validarDescricaoEDestino,
} from "@/lib/server/tarefasManuais";

export const runtime = "nodejs";

/**
 * Editar/excluir uma tarefa.
 *  - Gerência ("God Mode"): qualquer tarefa, em qualquer status — automática ou avulsa.
 *  - Quem criou uma tarefa avulsa: só ela, e a edição só enquanto pendente.
 */
async function carregarTarefa(
  id: string,
  uid: string,
  role: Role
): Promise<{ ref: FirebaseFirestore.DocumentReference; tarefa: Tarefa; ehGerencia: boolean } | NextResponse> {
  const ref = getAdminDb().collection("tarefas").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ erro: "Tarefa não encontrada." }, { status: 404 });

  const tarefa = snap.data() as Tarefa;
  const ehGerencia = role === "gerencia";
  const criadorDaAvulsa = tarefa.origem === "manual" && tarefa.criadaPor === uid;
  if (!ehGerencia && !criadorDaAvulsa) {
    return NextResponse.json(
      { erro: "Somente a Gerência, ou quem criou a tarefa avulsa, pode alterá-la." },
      { status: 403 }
    );
  }
  return { ref, tarefa, ehGerencia };
}

/** Colaborador ativo dono do quadro — só quando é único; ambíguo/ausente = null (o quadro basta). */
async function resolverColaboradorDoQuadro(quadro: Quadro): Promise<{ uid: string; nome: string } | null> {
  const snap = await getAdminDb().collection("users").where("ativo", "==", true).get();
  const donos = snap.docs.filter((d) => {
    const u = d.data() as { role?: Role; praca?: string };
    return quadro === "coordenador" || quadro === "analista" ? u.role === quadro : u.role === "assistente" && u.praca === quadro;
  });
  if (donos.length !== 1) return null;
  const nome = (donos[0].data() as { nome?: string }).nome;
  return nome ? { uid: donos[0].id, nome } : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;

    const alvo = await carregarTarefa(params.id, auth.uid, auth.role);
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
    const novoResponsavel = trocouColaborador ? await resolverColaboradorDoQuadro(novoQuadro) : null;
    await alvo.ref.update({
      descricao: valido.descricao,
      praca: novoQuadro,
      // Troca de colaborador = atribuição manual explícita: o carimbo de responsável, o quadro e o
      // override mudam juntos, para o card trocar de coluna na hora e as importações não reverterem.
      ...(trocouColaborador
        ? {
            quadro: novoQuadro,
            responsavelId: novoResponsavel?.uid ?? null,
            responsavelNome: novoResponsavel?.nome ?? null,
            overrideManual: true,
            pracaCustomizada: novoQuadro,
            responsavelCustomizadoId: novoResponsavel?.uid ?? null,
            responsavelCustomizadoNome: novoResponsavel?.nome ?? null,
          }
        : {}),
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

    const alvo = await carregarTarefa(params.id, auth.uid, auth.role);
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
