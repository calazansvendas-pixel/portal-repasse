import type { Quadro, Role } from "@/lib/types";

/**
 * Motor de Regras Dinâmicas (No-Code): permite à Gerência configurar, pela interface,
 * novos gatilhos de auditoria/geração de tarefa sem depender de um deploy de código.
 *
 * Este arquivo define só o MODELO DE DADOS e a UI de cadastro (Matriz de Responsabilidades).
 * O motor (`auditEngine.ts`) ainda não aplica estas regras às importações — ele só as lê e
 * tem o esqueleto do "Avaliador Dinâmico" pronto para receber a lógica de cada categoria
 * numa próxima etapa. Ver `src/lib/services/dynamicRuleEngine.ts`.
 */

/** As 9 categorias de gatilho previstas para o construtor visual. */
export type CategoriaGatilho =
  | "sla_estagnacao"
  | "volume_gargalo"
  | "analise_textual"
  | "regressao"
  | "ociosidade_imobiliaria"
  | "qualidade_reprovacao"
  | "conformidade"
  | "acoes_positivas"
  | "sla_interno";

export const CATEGORIA_GATILHO_LABEL: Record<CategoriaGatilho, string> = {
  sla_estagnacao: "SLA e Estagnação",
  volume_gargalo: "Volume e Gargalos",
  analise_textual: "Análise Textual",
  regressao: "Regressão",
  ociosidade_imobiliaria: "Ociosidade de Imobiliária",
  qualidade_reprovacao: "Qualidade / Reprovação",
  conformidade: "Conformidade",
  acoes_positivas: "Ações Positivas",
  sla_interno: "SLA Interno",
};

export const CATEGORIA_GATILHO_DESCRICAO: Record<CategoriaGatilho, string> = {
  sla_estagnacao: "Tempo parado na mesma etapa, ou prazo da etapa vencendo.",
  volume_gargalo: "Acúmulo de pastas na mesma etapa, imobiliária ou produto.",
  analise_textual: "Palavra-chave encontrada na observação da pasta.",
  regressao: "A pasta voltou etapas no funil, em vez de avançar.",
  ociosidade_imobiliaria:
    "Imobiliária sem enviar pasta nova há N dias (considera só imobiliárias já cadastradas neste sistema).",
  qualidade_reprovacao: "Volume de pastas reprovadas acima do limite.",
  conformidade: "Duplicidade de pasta ou vencimento de documento muito longo.",
  acoes_positivas: "Meta de sucesso batida ou velocidade de aprovação acima do esperado.",
  sla_interno: "Uma tarefa (deste próprio sistema) ficou aberta/esquecida há X dias.",
};

/** Cada categoria decide, na tela, quais destes campos genéricos mostrar e exigir. */
export interface ParametrosRegra {
  dias?: number;
  quantidade?: number;
  etapa?: string;
  palavraChave?: string;
  /** Só em "volume_gargalo": o que agrupa o acúmulo. */
  dimensao?: "etapa" | "imobiliaria" | "produto";
  /** Só em "conformidade": qual verificação aplicar. */
  subtipoConformidade?: "duplicidade" | "vencimento_longo";
}

/** "cargo" (padrão/legado): resolve pela praça da imobiliária, como sempre. "pessoa": fixa um
 * colaborador específico, ignorando a praça — ex.: sempre a Eliane, mesmo numa pasta da Laiza. */
export type DestinoTipo = "cargo" | "pessoa";

export interface RegraAuditoria {
  id: string;
  nomeRegra: string;
  /** Para quem a tarefa gerada por esta regra vai. Em destinoTipo "pessoa", é o cargo REAL do
   * colaborador fixado (mantém os rótulos/nível hierárquico funcionando sem checar destinoTipo). */
  cargoDestino: Role;
  /** Ausente/"cargo" = comportamento legado (resolve pela praça). "pessoa" = destino fixo abaixo. */
  destinoTipo?: DestinoTipo;
  /** uid do colaborador fixo, só quando destinoTipo === "pessoa". */
  pessoaId?: string | null;
  /** Nome do colaborador fixo, para exibir sem precisar relookup. */
  pessoaNome?: string | null;
  /** Quadro/coluna do colaborador fixo, calculado no momento do cadastro (null só para Gerência,
   * que não tem coluna própria no painel — mesma limitação de cargoDestino "gerencia"). */
  pessoaQuadro?: Quadro | null;
  categoriaGatilho: CategoriaGatilho;
  parametros: ParametrosRegra;
  /** Texto da tarefa exibido no card; aceita variáveis como {cliente}, {imobiliaria}, {etapa}. */
  textoTarefa: string;
  /** Igual à blindagem de auditEngine.ts: se true, a importação nunca fecha a tarefa sozinha. */
  exigeAcaoHumana: boolean;
  ativo: boolean;
  criadoEm: string;
  criadoPor: string;
  atualizadoEm: string;
}

export type NovaRegraAuditoria = Omit<RegraAuditoria, "id" | "criadoEm" | "criadoPor" | "atualizadoEm">;

export const CARGO_DESTINO_LABEL: Record<Role, string> = {
  assistente: "Assistente",
  analista: "Analista",
  coordenador: "Coordenador",
  gerencia: "Gerente",
};
