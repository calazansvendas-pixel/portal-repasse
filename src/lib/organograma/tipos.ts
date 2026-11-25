// Organograma (Funil Vivo da Equipe): configuração editável das etapas e checklists por pasta.

export interface Praca {
  id: string;
  nome: string;
  /** Trechos procurados no empreendimento e, depois, na cidade da planilha (sem acento). */
  termos: string[];
}

/** Um papel da etapa ("Nível 1", "Boleto/Sinal"...) e quem o exerce. */
export interface Papel {
  id: string;
  rotulo: string;
  /** Quem exerce em qualquer praça sem nome específico. */
  todas: string;
  porPraca: Record<string, string>;
}

export type TipoItem = "marca" | "opcoes" | "texto";

export interface ItemChecklist {
  id: string;
  texto: string;
  tipo: TipoItem;
  opcoes?: string[];
  /** Com "Casal / 2º Proponente" ligado, o item se repete para o cônjuge. */
  porProponente?: boolean;
}

export interface Modalidade {
  id: string;
  nome: string;
  itens: ItemChecklist[];
}

export interface EtapaOrganograma {
  codigo: string;
  bloco: number;
  nome: string;
  funcao: string;
  fluxoEsperado: string;
  /** Prazo em dias corridos na etapa; null = sem prazo. */
  slaDias: number | null;
  papeis: Papel[];
  /** Papel acionado quando a pasta atinge o prazo. */
  papelEscalonamento: string | null;
  selos: string[];
  /** Destaque visual de atenção (contrato sem sinal, pendência documental...). */
  alerta: boolean;
  /** Destaca as pastas que estão na etapa com o checklist incompleto. */
  conferirNaEntrada: boolean;
  /** Habilita a chave "Casal / 2º Proponente". */
  permiteCasal: boolean;
  modalidades: Modalidade[];
  atualizadoEm?: string;
  atualizadoPorNome?: string;
}

export interface Resposta {
  /** true/false para marcas; o texto escolhido ou digitado nos demais. */
  valor: boolean | string;
  /** Texto do item no momento da marcação (a configuração pode mudar depois). */
  texto: string;
  por: string;
  porNome: string;
  em: string;
}

export interface ChecklistEtapa {
  modalidadeId?: string;
  casal?: boolean;
  respostas?: Record<string, Resposta>;
}

/** Documento checklists_clientes/{numero}. */
export interface ChecklistPastaDoc {
  etapas: Record<string, ChecklistEtapa>;
}

export interface PassoTrajeto {
  codigo: string;
  /** Primeira planilha em que a pasta apareceu nessa permanência (yyyy-MM-dd). */
  data: string;
}

export interface PastaFunil {
  numero: string;
  clienteNome: string;
  produto: string;
  cidade: string;
  etapa: string;
  dataEntrada: string | null;
  /** Uma entrada por permanência (repetições diárias já agrupadas). */
  trajeto: PassoTrajeto[];
}

export interface DadosOrganograma {
  pracas: Praca[];
  etapas: EtapaOrganograma[];
  pastas: PastaFunil[];
  /** Código -> descrição oficial que veio na planilha. */
  nomesPlanilha: Record<string, string>;
  primeiraPlanilha: string | null;
  ultimaPlanilha: string | null;
  checklists: Record<string, ChecklistPastaDoc>;
  podeEditar: boolean;
}

export const BLOCOS: Record<number, string> = {
  1: "Entrada",
  2: "Esteira do Correspondente CAIXA",
  3: "Pendências & Tratativas",
  4: "Crédito Aprovado & Morada Vitória",
  5: "Proposta no VIMOB & Pente-Fino do Crédito",
  6: "Crédito Morar",
  7: "Contratos & Sinal",
  8: "Encerramento",
  9: "Outras etapas",
};
