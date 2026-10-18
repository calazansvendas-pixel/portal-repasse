import type { Firestore } from "firebase-admin/firestore";
import { lerAnaliseSnapshots, lerTarefasDaJanela, DIAS_PADRAO } from "@/lib/server/analytics";
import { calcularMapaTreinamento, calcularRankingParceiros, type CruzamentoPendencia, type RankingParceiro } from "./analiseParceiros";
import { codigoEtapa } from "@/lib/auth/roles";
import type { EvolucaoEtapas } from "./analiseEtapas";
import type { MetricasEstrategicas } from "./analiseEstrategica";
import type { LinhaPlanilha } from "./parseSheet";
import type { Tarefa } from "@/lib/types";

// Código da etapa de "Documentação incompleta" (ver codigoEtapa em roles.ts).
const ETAPA_DOCUMENTACAO_INCOMPLETA = "1.17";

export interface VolumeImobiliaria {
  imobiliaria: string;
  total: number;
}

/** Painel analítico consolidado — recalculado e persistido ao final de CADA importação (ver
 * `recalcularPainelAnalytics`, chamado por auditEngine.ts). O Dashboard (/analytics) lê este
 * snapshot para a janela padrão em vez de recalcular tudo a cada visita, e usa
 * `importacaoId`/`atualizadoEm` para o indicador "dados atualizados em". */
export interface PainelAnalyticsSnapshot {
  importacaoId: string; // yyyy-MM-dd da importação que gerou este snapshot
  atualizadoEm: string; // ISO datetime do cálculo
  dias: number; // janela usada no cálculo de evolucao/estrategicas/ranking/mapa
  evolucao: EvolucaoEtapas;
  estrategicas: MetricasEstrategicas;
  // % das pastas ATIVAS desta importação que estão na etapa 1.17 — sempre a foto do dia, não da janela.
  taxaDocumentacaoIncompletaPct: number;
  // Volume de pastas ATIVAS desta importação por imobiliária — idem, foto do dia.
  volumePorImobiliaria: VolumeImobiliaria[];
  ranking: RankingParceiro[];
  mapa: CruzamentoPendencia[];
  totalTarefas: number;
}

function calcularVolumePorImobiliaria(linhas: LinhaPlanilha[]): VolumeImobiliaria[] {
  const contagem = new Map<string, number>();
  for (const linha of linhas) {
    const chave = linha.responsavel?.trim() || "Não informado";
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return [...contagem.entries()].map(([imobiliaria, total]) => ({ imobiliaria, total })).sort((a, b) => b.total - a.total);
}

function calcularTaxaDocumentacaoIncompleta(linhas: LinhaPlanilha[]): number {
  if (linhas.length === 0) return 0;
  const emDocIncompleta = linhas.filter((l) => codigoEtapa(l.etapa) === ETAPA_DOCUMENTACAO_INCOMPLETA).length;
  return Math.round((emDocIncompleta / linhas.length) * 1000) / 10;
}

/**
 * Recalcula o painel analítico completo e grava em `analytics/painel`. Chamado uma vez ao final
 * de `executarAuditoriaDiaria`, depois que os batches da importação já foram confirmados — os
 * números refletem o estado recém-escrito, não uma foto desatualizada. Falhar aqui nunca deve
 * invalidar a importação em si (ver try/catch no chamador): o resumo da importação já está certo
 * mesmo que o snapshot do painel não tenha sido atualizado.
 */
export async function recalcularPainelAnalytics(db: Firestore, importacaoId: string, linhas: LinhaPlanilha[]): Promise<void> {
  const dias = DIAS_PADRAO;
  const [{ evolucao, estrategicas }, tarefas] = await Promise.all([
    lerAnaliseSnapshots(db, dias),
    lerTarefasDaJanela(db, dias),
  ]);
  const lista = tarefas as Tarefa[];

  const snapshot: PainelAnalyticsSnapshot = {
    importacaoId,
    atualizadoEm: new Date().toISOString(),
    dias,
    evolucao,
    estrategicas,
    taxaDocumentacaoIncompletaPct: calcularTaxaDocumentacaoIncompleta(linhas),
    volumePorImobiliaria: calcularVolumePorImobiliaria(linhas),
    ranking: calcularRankingParceiros(lista),
    mapa: calcularMapaTreinamento(lista),
    totalTarefas: lista.length,
  };
  await db.collection("analytics").doc("painel").set(snapshot);
}
