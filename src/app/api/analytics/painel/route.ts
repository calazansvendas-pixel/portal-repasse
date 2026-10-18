import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { podeVerAnalytics } from "@/lib/auth/roles";
import { autenticar } from "@/lib/server/tarefasManuais";
import {
  lerDias,
  lerAnaliseSnapshots,
  lerTarefasDaJanela,
  lerTarefasAtivas,
  lerColaboradoresAtivos,
  LIMITE_SNAPSHOTS,
  LIMITE_TAREFAS,
} from "@/lib/server/analytics";
import { calcularMapaTreinamento, calcularRankingParceiros } from "@/lib/services/analiseParceiros";
import { calcularProdutividadeColaboradores } from "@/lib/services/produtividadeColaboradores";
import type { PainelAnalyticsSnapshot } from "@/lib/services/painelAnalyticsService";
import type { Tarefa } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Painel analítico numa única chamada: evolução por etapa (snapshots) + ranking e mapa de
 * imobiliárias (tarefas). Cada fonte é lida uma vez e as métricas saem de cálculo em memória.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!podeVerAnalytics(auth.role)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }

    const db = getAdminDb();
    const dias = lerDias(req);

    // Snapshot consolidado ao final da última importação (ver painelAnalyticsService.ts) — lido
    // sempre, mesmo quando a janela pedida exige recálculo abaixo: "taxaDocumentacaoIncompletaPct"
    // e "volumePorImobiliaria" são sempre a foto do dia (não dependem de `dias`), e
    // `ultimaImportacao` alimenta o indicador "dados atualizados em" da tela.
    const painelSnap = await db.collection("analytics").doc("painel").get();
    const painel = painelSnap.exists ? (painelSnap.data() as PainelAnalyticsSnapshot) : null;
    const ultimaImportacao = painel ? { id: painel.importacaoId, atualizadoEm: painel.atualizadoEm } : null;

    // Janela padrão: reaproveita o snapshot já calculado, sem recontar nada.
    if (painel && dias === painel.dias) {
      return NextResponse.json({
        dias,
        evolucao: painel.evolucao,
        estrategicas: painel.estrategicas,
        ranking: painel.ranking,
        mapa: painel.mapa,
        totalTarefas: painel.totalTarefas,
        taxaDocumentacaoIncompletaPct: painel.taxaDocumentacaoIncompletaPct,
        volumePorImobiliaria: painel.volumePorImobiliaria,
        produtividade: painel.produtividade,
        ultimaImportacao,
        parcial: { snapshots: null, tarefas: null },
      });
    }

    const [{ evolucao, estrategicas, truncado }, tarefasJanela, tarefasAtivas, colaboradores] = await Promise.all([
      lerAnaliseSnapshots(db, dias),
      lerTarefasDaJanela(db, dias),
      lerTarefasAtivas(db),
      lerColaboradoresAtivos(db),
    ]);
    const lista = tarefasJanela as Tarefa[];

    return NextResponse.json({
      dias,
      evolucao,
      estrategicas,
      ranking: calcularRankingParceiros(lista),
      mapa: calcularMapaTreinamento(lista),
      totalTarefas: lista.length,
      taxaDocumentacaoIncompletaPct: painel?.taxaDocumentacaoIncompletaPct ?? 0,
      volumePorImobiliaria: painel?.volumePorImobiliaria ?? [],
      produtividade: calcularProdutividadeColaboradores(colaboradores, tarefasAtivas, tarefasJanela),
      ultimaImportacao,
      // Avisa a tela quando algum teto de leitura foi atingido (dados parciais).
      parcial: {
        snapshots: truncado ? LIMITE_SNAPSHOTS : null,
        tarefas: lista.length >= LIMITE_TAREFAS ? LIMITE_TAREFAS : null,
      },
    });
  } catch (error) {
    console.error("[analytics/painel] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao calcular analytics.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
