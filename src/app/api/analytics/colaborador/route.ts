import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { podeVerAnalytics } from "@/lib/auth/roles";
import { autenticar } from "@/lib/server/tarefasManuais";
import { lerColaboradoresAtivos, lerDias, lerProdutosPorNumero, lerTarefasParaDetalhe } from "@/lib/server/analytics";
import { calcularDetalheColaborador, numerosDasTarefas, tarefasDoColaborador } from "@/lib/services/detalheColaborador";

export const runtime = "nodejs";

/**
 * Relatório analítico individual (Gerência): métricas de etapas, empreendimentos e pastas ativas de
 * UM colaborador, extraídas do trajeto (`historicoEtapas`) das tarefas sob posse dele. Sob demanda —
 * o painel principal não paga esta leitura.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!podeVerAnalytics(auth.role)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }

    const uid = req.nextUrl.searchParams.get("uid")?.trim();
    if (!uid) return NextResponse.json({ erro: "Informe o colaborador (uid)." }, { status: 400 });

    const db = getAdminDb();
    const dias = lerDias(req);
    const [colaboradores, tarefas] = await Promise.all([lerColaboradoresAtivos(db), lerTarefasParaDetalhe(db, dias)]);

    const selecao = tarefasDoColaborador(colaboradores, tarefas, uid);
    if (!selecao) return NextResponse.json({ erro: "Colaborador não encontrado." }, { status: 404 });

    const produtos = await lerProdutosPorNumero(db, numerosDasTarefas(selecao.tarefas));
    return NextResponse.json(calcularDetalheColaborador(selecao.colaborador, selecao.tarefas, produtos, dias));
  } catch (error) {
    console.error("[analytics/colaborador] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao calcular o relatório do colaborador.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
