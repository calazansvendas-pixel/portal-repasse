import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Role, Tarefa } from "@/lib/types";
import { NIVEL_POR_QUADRO, autenticar, validarDescricaoEDestino } from "@/lib/server/tarefasManuais";

export const runtime = "nodejs";

/**
 * Editar/excluir uma Tarefa Avulsa. Só quem criou a tarefa ou a Gerência.
 * Cartões automáticos (vindos da planilha) nunca passam por aqui.
 */
async function carregarTarefaManual(
  id: string,
  uid: string,
  role: Role
): Promise<{ ref: FirebaseFirestore.DocumentReference; tarefa: Tarefa } | NextResponse> {
  const ref = getAdminDb().collection("tarefas").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ erro: "Tarefa não encontrada." }, { status: 404 });

  const tarefa = snap.data() as Tarefa;
  if (tarefa.origem !== "manual") {
    return NextResponse.json({ erro: "Só tarefas avulsas podem ser editadas ou excluídas." }, { status: 400 });
  }
  if (role !== "gerencia" && tarefa.criadaPor !== uid) {
    return NextResponse.json(
      { erro: "Somente quem criou a tarefa ou a Gerência pode alterá-la." },
      { status: 403 }
    );
  }
  return { ref, tarefa };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;

    const alvo = await carregarTarefaManual(params.id, auth.uid, auth.role);
    if (alvo instanceof NextResponse) return alvo;

    if (alvo.tarefa.status !== "pendente") {
      return NextResponse.json(
        { erro: "Tarefa já concluída — reverta a conclusão antes de editar." },
        { status: 409 }
      );
    }

    const body = (await req.json().catch(() => null)) as { descricao?: unknown; atribuidoPara?: unknown } | null;
    const valido = validarDescricaoEDestino(auth.role, body?.descricao, body?.atribuidoPara, alvo.tarefa.praca);
    if (valido instanceof NextResponse) return valido;

    await alvo.ref.update({
      descricao: valido.descricao,
      praca: valido.atribuidoPara,
      nivel: NIVEL_POR_QUADRO[valido.atribuidoPara],
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

    const alvo = await carregarTarefaManual(params.id, auth.uid, auth.role);
    if (alvo instanceof NextResponse) return alvo;

    await alvo.ref.delete();
    return NextResponse.json({ id: params.id });
  } catch (error) {
    console.error("[tarefas/DELETE] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao excluir a tarefa.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
