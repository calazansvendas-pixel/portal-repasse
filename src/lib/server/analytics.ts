import type { Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { calcularEvolucaoEtapas, type EvolucaoEtapas, type SnapshotEtapa } from "@/lib/services/analiseEtapas";
import type { Tarefa } from "@/lib/types";

export const DIAS_PADRAO = 21;
export const DIAS_MAXIMO = 90; // teto da janela de análise (cada dia lê milhares de snapshots)
const LIMITE_SNAPSHOTS = 8000; // proteção contra datasets muito grandes
export const LIMITE_TAREFAS = 5000;

/** Teto obrigatório: valor ausente, inválido ou absurdo nunca vira uma consulta sem limite. */
export function lerDias(req: NextRequest): number {
  const pedido = Math.floor(Number(req.nextUrl.searchParams.get("dias") ?? DIAS_PADRAO));
  return Number.isFinite(pedido) ? Math.min(Math.max(pedido, 1), DIAS_MAXIMO) : DIAS_PADRAO;
}

/** Evolução de permanência por etapa a partir dos snapshots das últimas `dias` importações. */
export async function lerEvolucaoEtapas(db: Firestore, dias: number): Promise<EvolucaoEtapas> {
  const importacoesSnap = await db.collection("importacoes").orderBy("id", "desc").limit(dias).get();
  const importacaoIds = importacoesSnap.docs.map((d) => d.id);
  if (importacaoIds.length === 0) return calcularEvolucaoEtapas([]);

  const entradas: SnapshotEtapa[] = [];
  for (let i = 0; i < importacaoIds.length; i += 10) {
    const snap = await db
      .collectionGroup("snapshots")
      .where("importacaoId", "in", importacaoIds.slice(i, i + 10))
      .select("numero", "importacaoId", "etapa")
      .limit(LIMITE_SNAPSHOTS)
      .get();
    snap.forEach((doc) => {
      const data = doc.data();
      entradas.push({ numero: data.numero, importacaoId: data.importacaoId, etapa: data.etapa });
    });
  }
  return calcularEvolucaoEtapas(entradas);
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
