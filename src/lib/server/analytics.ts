import type { Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { calcularEvolucaoEtapas, type EvolucaoEtapas, type SnapshotEtapa } from "@/lib/services/analiseEtapas";
import { calcularMetricasEstrategicas, type MetricasEstrategicas } from "@/lib/services/analiseEstrategica";
import type { Registro, Tarefa } from "@/lib/types";

export const DIAS_PADRAO = 21;
export const DIAS_MAXIMO = 90; // teto da janela de análise (cada dia lê milhares de snapshots)
const LIMITE_SNAPSHOTS = 8000; // proteção contra datasets muito grandes
export const LIMITE_TAREFAS = 5000;

/** Teto obrigatório: valor ausente, inválido ou absurdo nunca vira uma consulta sem limite. */
export function lerDias(req: NextRequest): number {
  const pedido = Math.floor(Number(req.nextUrl.searchParams.get("dias") ?? DIAS_PADRAO));
  return Number.isFinite(pedido) ? Math.min(Math.max(pedido, 1), DIAS_MAXIMO) : DIAS_PADRAO;
}

export interface AnaliseSnapshots {
  evolucao: EvolucaoEtapas;
  estrategicas: MetricasEstrategicas;
}

/**
 * Lê UMA vez os snapshots das últimas `dias` importações e deriva, em memória:
 *  - a evolução de permanência por etapa;
 *  - os indicadores estratégicos, sobre as pastas da importação mais recente (foto atual da esteira).
 * Os indicadores estratégicos reaproveitam esta leitura: não custam nenhuma leitura extra.
 */
export async function lerAnaliseSnapshots(db: Firestore, dias: number): Promise<AnaliseSnapshots> {
  const importacoesSnap = await db.collection("importacoes").orderBy("id", "desc").limit(dias).get();
  const importacaoIds = importacoesSnap.docs.map((d) => d.id);
  if (importacaoIds.length === 0) {
    return { evolucao: calcularEvolucaoEtapas([]), estrategicas: calcularMetricasEstrategicas([]) };
  }
  const maisRecente = importacaoIds[0]; // ordenado por id (yyyy-MM-dd) decrescente

  const entradas: SnapshotEtapa[] = [];
  const pastasAtuais: Pick<Registro, "etapa" | "observacao">[] = [];
  for (let i = 0; i < importacaoIds.length; i += 10) {
    const snap = await db
      .collectionGroup("snapshots")
      .where("importacaoId", "in", importacaoIds.slice(i, i + 10))
      .select("numero", "importacaoId", "etapa", "observacao")
      .limit(LIMITE_SNAPSHOTS)
      .get();
    snap.forEach((doc) => {
      const data = doc.data();
      entradas.push({ numero: data.numero, importacaoId: data.importacaoId, etapa: data.etapa });
      if (data.importacaoId === maisRecente) {
        pastasAtuais.push({ etapa: String(data.etapa ?? ""), observacao: String(data.observacao ?? "") });
      }
    });
  }
  return {
    evolucao: calcularEvolucaoEtapas(entradas),
    estrategicas: calcularMetricasEstrategicas(pastasAtuais as Registro[]),
  };
}

/** Evolução de permanência por etapa (rota legada /api/analytics/etapas). */
export async function lerEvolucaoEtapas(db: Firestore, dias: number): Promise<EvolucaoEtapas> {
  return (await lerAnaliseSnapshots(db, dias)).evolucao;
}

export type TarefaAnalitica = Pick<
  Tarefa,
  "imobiliaria" | "tipoPendencia" | "status" | "criadoEm" | "resolvidoEm" | "atualizadoEm" | "falhaAuditoriaEm"
>;

/**
 * Tarefas criadas na janela (uma única consulta), lendo só os campos que as métricas usam.
 * Inclui as validadas: o ranking precisa delas para contar resolvidas e tempo de resolução.
 */
export async function lerTarefasDaJanela(db: Firestore, dias: number): Promise<TarefaAnalitica[]> {
  const corte = new Date(Date.now() - dias * 86_400_000).toISOString();
  const snap = await db
    .collection("tarefas")
    .where("criadoEm", ">=", corte)
    .select("imobiliaria", "tipoPendencia", "status", "criadoEm", "resolvidoEm", "atualizadoEm", "falhaAuditoriaEm")
    .limit(LIMITE_TAREFAS)
    .get();
  return snap.docs.map((d) => d.data() as TarefaAnalitica);
}
