// Tipos centrais do domínio do Portal de Repasse.

export type Role = "gerencia" | "coordenador" | "analista" | "assistente";

export type Assistente = "laiza" | "eliane" | "catarina";

/** Quadro de escalonamento: além do quadro principal da tarefa, ela pode
 * aparecer simultaneamente no quadro do Coordenador (SLA urgente/estourado)
 * e/ou no quadro da Analista (falha de auditoria). */
export type QuadroEscalonamento = "coordenador" | "analista";

/** Todo quadro de tarefas existente no sistema: as 3 praças regionais + os
 * quadros nativos do Coordenador e da Analista (que agora também recebem
 * tarefas geradas diretamente para eles, não só escalonamentos). */
export type Quadro = Assistente | QuadroEscalonamento;

/** Nível hierárquico que originou a tarefa (ver taskRouter.ts). */
export type NivelTarefa = "operacional" | "analitico" | "tatico";

/** Uma tarefa nasce de uma linha específica da planilha (uma pasta) ou de uma
 * agregação entre várias linhas (ex: gargalo de etapa, filtro de qualificação
 * ruim por imobiliária). */
export type OrigemTarefa = "linha" | "agregado";

export interface UserProfile {
  uid: string;
  nome: string;
  email: string;
  role: Role;
  // Preenchido apenas para role === "assistente": qual quadro/praça o usuário enxerga.
  praca?: Assistente;
  ativo: boolean;
  criadoEm: string; // ISO date
}

export type SlaStatus = "no_prazo" | "atencao" | "urgente" | "estourado";

/** Estado atual (mais recente) de uma pasta, identificada pela coluna "Número". */
export interface Registro {
  numero: string; // ID único da pasta — chave primária
  cpfCnpj: string;
  cidade: string;
  responsavel: string; // Imobiliária parceira
  etapa: string;
  prazoEtapa: string | null; // ISO date
  observacao: string;
  slaStatus: SlaStatus;
  criadoEm: string; // ISO date da primeira vez que a pasta apareceu
  atualizadoEm: string; // ISO date da última importação que tocou esta pasta
  etapaAnterior?: string | null;
  observacaoAnterior?: string | null;
}

/** Snapshot bruto de uma pasta em uma importação específica (histórico/auditoria). */
export interface RegistroSnapshot {
  numero: string;
  cpfCnpj: string;
  cidade: string;
  responsavel: string;
  etapa: string;
  prazoEtapa: string | null;
  observacao: string;
  importacaoId: string; // = data da importação, ex "2026-09-24"
  importadoEm: string; // ISO datetime
}

export interface Importacao {
  id: string; // data no formato yyyy-MM-dd
  nomeArquivo: string;
  importadoPor: string; // uid
  importadoEm: string; // ISO datetime
  totalRegistros: number;
  novos: number;
  atualizados: number;
  tarefasCriadas: number;
  tarefasValidadas: number;
  falhasAuditoria: number;
}

export type TarefaStatus =
  | "pendente"
  | "pending_validation"
  | "validated_done"
  | "audit_failed";

export interface Tarefa {
  id: string;
  // Identidade estável da regra que gerou esta tarefa — usada pelo motor de
  // auditoria para reconciliar a mesma tarefa entre importações consecutivas.
  // Ex: "A000033432::operacional", "AGREGADO::gargalo::SERRA::0.80 - ...".
  chaveRegra: string;
  origem: OrigemTarefa;
  nivel: NivelTarefa;
  // Importação (yyyy-MM-dd) que CRIOU esta tarefa — não é atualizado em
  // reconciliações seguintes. Usado pela exclusão em cascata de uma
  // importação específica (só apaga tarefas nascidas dela, não as que só
  // foram atualizadas nesse dia).
  importacaoIdCriacao?: string;
  numero: string | null; // referência ao Registro (origem "linha"); null em agregados
  numerosRelacionados?: string[]; // pastas envolvidas (origem "agregado")
  cidade: string;
  // Quadro PRINCIPAL onde a tarefa vive (assistente regional, ou diretamente
  // "coordenador"/"analista" para tarefas táticas/analíticas nativas). O nome
  // do campo ficou "praca" por compatibilidade com o índice do Firestore já
  // publicado — mas o tipo agora é o Quadro completo, não só Assistente.
  praca: Quadro;
  imobiliaria: string;
  etapa: string;
  prazoEtapa: string | null;
  slaStatus: SlaStatus;
  tipoPendencia: string; // categoria da tarefa, ex "Risco bancário"
  descricao: string; // texto de ação pronto para o card
  observacaoOriginal: string;
  status: TarefaStatus;
  criadoEm: string;
  atualizadoEm: string;
  resolvidoPor?: string | null;
  resolvidoEm?: string | null;
  etapaNoMomentoResolucao?: string | null;
  observacaoNoMomentoResolucao?: string | null;
  falhaAuditoriaMotivo?: string | null;
  falhaAuditoriaEm?: string | null;
  // Quadros extras onde este mesmo card também deve aparecer simultaneamente
  // (recalculado a cada importação — ver auditEngine.ts).
  escalonadoPara: QuadroEscalonamento[];
}

export interface Notificacao {
  id: string;
  tipo: "falha_auditoria" | "nova_pendencia";
  tarefaId: string;
  numero: string;
  mensagem: string;
  destinatariosRoles: Role[];
  criadoEm: string;
  lida: boolean;
}

export const ROLE_LABEL: Record<Role, string> = {
  gerencia: "Gerência",
  coordenador: "Coordenador",
  analista: "Analista",
  assistente: "Assistente Regional",
};

export const ASSISTENTE_LABEL: Record<Assistente, string> = {
  laiza: "Laiza (Serra)",
  eliane: "Eliane (Vila Velha)",
  catarina: "Catarina (Fátima e Camburi)",
};

export const QUADRO_LABEL: Record<Quadro, string> = {
  laiza: "Laiza (Serra)",
  eliane: "Eliane (Vila Velha)",
  catarina: "Catarina (Fátima e Camburi)",
  coordenador: "Paulo (Coordenador)",
  analista: "Andressa (Analista)",
};
