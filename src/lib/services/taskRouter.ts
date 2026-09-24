import { normalize } from "@/lib/auth/roles";
import type { SlaStatus } from "@/lib/types";
import { SLA_LABEL } from "@/lib/utils/sla";

export interface PendenciaDetectada {
  tipoPendencia: string;
  acao: string; // verbo de ação curto, ex: "Cobrar novo RG"
}

/**
 * Dicionário de palavras-chave extraídas do campo "Observação" -> categoria de
 * pendência + ação recomendada. Ordem importa: a primeira regra que bater vence.
 * Fácil de estender conforme o time de operação identifica novos padrões de texto.
 */
const REGRAS_PENDENCIA: { chave: string; padroes: string[]; tipoPendencia: string; acao: string }[] = [
  { chave: "rg_vencido", padroes: ["rg vencido", "rg venceu", "identidade vencida"], tipoPendencia: "RG vencido", acao: "Cobrar novo RG do cliente" },
  { chave: "cpf_pendente", padroes: ["cpf pendente", "cpf irregular", "cpf divergente"], tipoPendencia: "CPF irregular", acao: "Solicitar regularização do CPF" },
  { chave: "comprovante_renda", padroes: ["comprovante de renda", "comprovante renda"], tipoPendencia: "Comprovante de renda", acao: "Cobrar comprovante de renda atualizado" },
  { chave: "comprovante_residencia", padroes: ["comprovante de residencia", "comprovante residencia", "comprovante de endereco"], tipoPendencia: "Comprovante de residência", acao: "Cobrar comprovante de residência atualizado" },
  { chave: "certidao", padroes: ["certidao"], tipoPendencia: "Certidão pendente", acao: "Cobrar certidão solicitada" },
  { chave: "contrato_assinatura", padroes: ["assinatura", "contrato nao assinado", "aguardando assinatura"], tipoPendencia: "Assinatura de contrato", acao: "Cobrar assinatura do contrato" },
  { chave: "documento_vencido", padroes: ["vencido", "venceu", "vencida"], tipoPendencia: "Documento vencido", acao: "Cobrar atualização de documento vencido" },
  { chave: "pendencia_bancaria", padroes: ["banco", "financiamento", "fgts"], tipoPendencia: "Pendência bancária/financiamento", acao: "Verificar andamento junto ao banco" },
  { chave: "documentacao_geral", padroes: ["pendente", "pendencia", "falta", "aguardando"], tipoPendencia: "Documentação pendente", acao: "Levantar e cobrar documentação pendente" },
];

export function detectarPendencia(observacao: string): PendenciaDetectada | null {
  const texto = normalize(observacao);
  if (!texto) return null;
  for (const regra of REGRAS_PENDENCIA) {
    if (regra.padroes.some((p) => texto.includes(p))) {
      return { tipoPendencia: regra.tipoPendencia, acao: regra.acao };
    }
  }
  return null;
}

const SLA_ACAO_LABEL: Record<SlaStatus, string> = {
  no_prazo: SLA_LABEL.no_prazo,
  atencao: SLA_LABEL.atencao,
  urgente: SLA_LABEL.urgente,
  estourado: SLA_LABEL.estourado,
};

/**
 * Monta o texto de ação exibido no card da tarefa, ex:
 * "Ligar para Imobiliária X - Cobrar novo RG do cliente. SLA: Urgente"
 */
export function montarDescricaoTarefa(params: {
  responsavel: string;
  acao: string;
  numero: string;
  slaStatus: SlaStatus;
}): string {
  const { responsavel, acao, numero, slaStatus } = params;
  const imobiliaria = responsavel || "imobiliária não informada";
  return `Ligar para ${imobiliaria} - ${acao} (pasta ${numero}). SLA: ${SLA_ACAO_LABEL[slaStatus]}`;
}
