import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { temPermissao } from "@/lib/auth/cargos";
import { quadroEfetivoDaTarefa, quadrosParaBuscar } from "@/lib/auth/roles";
import { NIVEL_POR_QUADRO, autenticar, camposDeTransferencia } from "@/lib/server/tarefasManuais";
import { QUADROS_TRANSFERIVEIS } from "@/lib/types";
import type { Tarefa } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Transferir uma tarefa para outro quadro. Exige a permissão "transferirTarefas" e que a tarefa
 * esteja num quadro que a pessoa enxerga; só muda o destino, nada do conteúdo.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!temPermissao(auth.perfil, "transferirTarefas")) {
      return NextResponse.json({ erro: "Seu perfil não tem permissão para transferir tarefas." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { destino?: unknown } | null;
    const destino = QUADROS_TRANSFERIVEIS.find((q) => q === body?.destino);
    if (!destino) return NextResponse.json({ erro: "Escolha um quadro de destino válido." }, { status: 400 });

    const ref = getAdminDb().collection("tarefas").doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ erro: "Tarefa não encontrada." }, { status: 404 });
    const tarefa = snap.data() as Tarefa;

    const visiveis = quadrosParaBuscar(auth.perfil);
    const atual = quadroEfetivoDaTarefa(tarefa);
    const enxerga = [tarefa.praca, atual, ...(tarefa.escalonadoPara ?? [])].some((q) => visiveis.includes(q));
    if (!enxerga) return NextResponse.json({ erro: "Esta tarefa não está em um quadro que você acessa." }, { status: 403 });
    if (tarefa.status === "pending_validation" || tarefa.status === "validated_done") {
      return NextResponse.json({ erro: "Tarefa já concluída — reverta a conclusão antes de transferir." }, { status: 409 });
    }
    if (destino === atual) return NextResponse.json({ erro: "A tarefa já está nesse quadro." }, { status: 400 });

    await ref.update({
      ...(await camposDeTransferencia(destino)),
      ...(tarefa.origem === "manual" ? { nivel: NIVEL_POR_QUADRO[destino] } : {}),
      atualizadoEm: new Date().toISOString(),
    });
    return NextResponse.json({ id: params.id });
  } catch (error) {
    console.error("[tarefas/transferir] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao transferir a tarefa.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
