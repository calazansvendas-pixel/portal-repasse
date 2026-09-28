import { normalize } from "@/lib/auth/roles";
import type { Quadro, QuadroEscalonamento } from "@/lib/types";

/**
 * Utilitários de etapa e escalonamento compartilhados pelo motor de auditoria
 * (auditEngine.ts) e pelo Motor de Regras Dinâmicas (dynamicRuleEngine.ts).
 *
 * As regras de geração de tarefa em si (o que dispara, para quem, com qual texto) não vivem
 * mais aqui: desde a migração para o Motor de Regras Dinâmicas, toda tarefa nasce de uma regra
 * cadastrada em `regras_auditoria` (ver dynamicRuleEngine.ts). Este arquivo guarda só as
 * classificações de etapa que continuam sendo lógica estrutural do motor (fim de esteira,
 * mensagem de auditoria estrita da 0.80) e o cálculo de escalonamento simultâneo.
 */

/** Etapa 0.01 (Inclusão da pasta) — a virada dela não depende das assistentes. */
export function ehEtapaInclusao(etapa: string | null | undefined): boolean {
  return (etapa ?? "").trim().startsWith("0.01");
}

/**
 * Etapa 0.80: a equipe tem poder de resolução — auditoria ESTRITA (sem confiança no clique;
 * só a mudança de etapa na planilha completa a tarefa).
 */
export function ehEtapa080(etapa: string | null | undefined): boolean {
  return (etapa ?? "").trim().startsWith("0.80");
}

export const MENSAGEM_FALHA_080 = "A tarefa para ser completa precisa ter a etapa modificada na planilha.";

/** Fim de esteira: etapas 9.xx ou indicativo de venda imputada — a pasta é arquivada. */
export function ehFimDeEsteira(etapa: string | null | undefined): boolean {
  const e = (etapa ?? "").trim();
  return /^9\./.test(e) || normalize(e).includes("imputad");
}

function contemAlgumTermo(observacaoNormalizada: string, termos: string[]): string | null {
  for (const termo of termos) {
    const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escapado}\\b`, "i").test(observacaoNormalizada)) return termo;
  }
  return null;
}

const TERMOS_QUALIFICACAO = ["apontamento", "restricao"];

/** Reaproveitado pelas métricas estratégicas da Gerência (Taxa de Vazamento de Funil). */
export function contemQualificacaoRuim(observacao: string): boolean {
  return contemAlgumTermo(normalize(observacao), TERMOS_QUALIFICACAO) !== null;
}

// ---------------------------------------------------------------------------
// Escalonamento simultâneo (falha de auditoria -> Analista)
// ---------------------------------------------------------------------------

/** Escalonamento simultâneo é restrito à Analista, em falha de auditoria. */
export function calcularEscalonamento(params: {
  quadro: Quadro;
  falhouAuditoriaAgora: boolean;
}): QuadroEscalonamento[] {
  const { quadro, falhouAuditoriaAgora } = params;
  const escalonamento: QuadroEscalonamento[] = [];
  if (falhouAuditoriaAgora && quadro !== "analista") {
    escalonamento.push("analista");
  }
  return escalonamento;
}
