import { normalize } from "@/lib/auth/roles";

/**
 * Utilitários de etapa compartilhados pelo motor de auditoria (auditEngine.ts) e pelo Motor de
 * Regras Dinâmicas (dynamicRuleEngine.ts).
 *
 * As regras de geração de tarefa em si (o que dispara, para quem, com qual texto) não vivem
 * mais aqui: desde a migração para o Motor de Regras Dinâmicas, toda tarefa nasce de uma regra
 * cadastrada em `regras_auditoria` (ver dynamicRuleEngine.ts). Este arquivo guarda só a
 * classificação de etapa que continua sendo lógica estrutural do motor (fim de esteira).
 */

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
