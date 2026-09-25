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
export type OrigemTarefa = "linha" | "agregado" | "manual";

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
  // Fim de esteira (etapas 9.xx): pasta arquivada em "Vendas Concluídas" —
  // não gera mais tarefas nem entra nos quadros ativos.
  arquivada?: boolean;
  arquivadaEm?: string | null;
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
  pastasArquivadas?: number;
}

export type TarefaStatus =
  | "pendente"
  | "pending_validation"
  | "validated_done"
  | "audit_failed";

/** Pasta dentro de uma tarefa agregada (gargalo): vira uma sub-tarefa com check próprio. */
export interface ClienteEnvolvido {
  numero: string;
  clienteNome: string;
  imobiliaria: string;
  observacao: string;
  etapa: string;
  dataEntrada: string | null;
  historicoEtapas: EtapaHistorico[];
  concluido: boolean;
}

/** Um "salto" de etapa no trajeto da pasta — um item do Stepper/Timeline do card. */
export interface EtapaHistorico {
  etapa: string;
  data: string; // ISO — importação em que essa etapa foi observada pela 1ª vez
  observacao: string; // observação da planilha no momento desse salto
  status: SlaStatus;
}

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
  numerosRelacionados?: string[] | null; // pastas envolvidas (origem "agregado"); null em tarefas de linha
  clienteNome?: string | null; // "1º Proponente" — vazio em tarefas agregadas
  dataEntrada?: string | null; // ISO — "Data Inclusão"/"Data da venda", base da linha do tempo do card
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
  // Tarefa avulsa (origem "manual"): quem delegou.
  criadaPor?: string | null; // uid
  criadaPorNome?: string | null;
  notaResolucao?: string | null;
  // Tarefas agregadas: as pastas do gargalo, cada uma com o próprio check.
  clientesEnvolvidos?: ClienteEnvolvido[];
  // Prazo para a ação (yyyy-MM-dd), definido na criação; editável pela Gerência.
  dataLimite?: string | null;
  // A Gerência reescreveu o texto: as importações seguintes não o sobrescrevem.
  descricaoEditada?: boolean; // "O que foi feito?" — anotação de quem concluiu
  etapaNoMomentoResolucao?: string | null;
  observacaoNoMomentoResolucao?: string | null;
  falhaAuditoriaMotivo?: string | null;
  falhaAuditoriaEm?: string | null;
  // Quadros extras onde este mesmo card também deve aparecer simultaneamente
  // (recalculado a cada importação — ver auditEngine.ts).
  escalonadoPara: QuadroEscalonamento[];
  // Trajeto acumulado da pasta ao longo dos Daily Deltas (origem "linha" apenas).
  // Um novo item é emendado quando a etapa muda; se a etapa se repete, o
  // último item é só refrescado (observação/status), sem duplicar entradas.
  historicoEtapas: EtapaHistorico[];
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
