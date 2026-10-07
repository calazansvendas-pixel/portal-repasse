import type { Assistente, Quadro, QuadroEscalonamento, Role, UserProfile } from "@/lib/types";

/** Cidades oferecidas no filtro de /tarefas e mapeamento padrão de praça: a checagem é feita por
 * inclusão normalizada (minúsculas, sem acento), então "Bairro de Fátima" bate com "fatima". A
 * Gerência pode substituir esse padrão por cidade — ver PracaOverrides/resolvePracaPorCidade. */
export const CIDADES_FILTRO: { chave: string; label: string; praca: Assistente }[] = [
  { chave: "serra", label: "Serra", praca: "laiza" },
  { chave: "vila velha", label: "Vila Velha", praca: "eliane" },
  { chave: "fatima", label: "Fátima", praca: "catarina" },
  { chave: "camburi", label: "Camburi", praca: "catarina" },
];

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Substituição explícita do vínculo padrão de uma praça (chave de CIDADES_FILTRO -> assistente).
 * Ausente/undefined numa chave = "Automático": mantém o mapeamento padrão daquela cidade. */
export type PracaOverrides = Partial<Record<string, Assistente>>;

/** Dada a "Cidade do empreendimento" de uma linha da planilha, resolve a praça responsável —
 * primeiro por um override explícito (configurável pela Gerência), senão pelo mapeamento padrão. */
export function resolvePracaPorCidade(cidade: string, overrides?: PracaOverrides | null): Assistente | null {
  const alvo = normalize(cidade);
  for (const entrada of CIDADES_FILTRO) {
    if (alvo.includes(entrada.chave)) {
      return overrides?.[entrada.chave] ?? entrada.praca;
    }
  }
  return null;
}

/** Quais praças (quadros de tarefas) o usuário pode enxergar. */
export function pracasVisiveis(profile: UserProfile): Assistente[] {
  const todas: Assistente[] = ["laiza", "eliane", "catarina"];
  switch (profile.role) {
    case "gerencia":
    case "coordenador":
    case "analista":
      return todas;
    case "assistente":
      return profile.praca ? [profile.praca] : [];
    default:
      return [];
  }
}

/**
 * Colunas de Coordenador/Analista visíveis no quadro de tarefas de cada perfil.
 * Gerência e Coordenador enxergam as duas; a Analista enxerga só a própria
 * (nunca o quadro do Coordenador); assistentes não têm essas colunas.
 */
export function quadrosEscalonamentoVisiveis(profile: UserProfile): QuadroEscalonamento[] {
  switch (profile.role) {
    case "gerencia":
    case "coordenador":
      return ["coordenador", "analista"];
    case "analista":
      return ["analista"];
    default:
      return [];
  }
}

/** Para quem o perfil pode delegar uma tarefa avulsa (hierarquia: só para baixo). */
export function destinatariosPermitidos(role: Role): Quadro[] {
  switch (role) {
    case "gerencia":
      return ["coordenador", "analista", "laiza", "eliane", "catarina"];
    case "coordenador":
      return ["analista", "laiza", "eliane", "catarina"];
    case "analista":
      return ["laiza", "eliane", "catarina"];
    default:
      return [];
  }
}

/**
 * Todos os quadros que precisam ser buscados no Firestore para montar a tela
 * de um perfil: as praças regionais visíveis + os quadros nativos de
 * Coordenador/Analista (que agora recebem tarefas geradas diretamente para
 * eles, não só escalonamentos de uma tarefa regional).
 */
export function quadrosParaBuscar(profile: UserProfile): Quadro[] {
  return [...pracasVisiveis(profile), ...quadrosEscalonamentoVisiveis(profile)];
}

/**
 * Em qual(is) quadro(s) o usuário pode efetivamente marcar/desmarcar o
 * checkbox de uma tarefa. Só o dono de um quadro pode resolvê-lo:
 * assistente no seu próprio, Coordenador no dele, Analista no dela.
 * Gerência nunca interage — só observa (god mode é leitura, não ação).
 */
export function meuQuadroInterativo(profile: UserProfile): Quadro[] {
  switch (profile.role) {
    case "assistente":
      return profile.praca ? [profile.praca] : [];
    case "coordenador":
      return ["coordenador"];
    case "analista":
      return ["analista"];
    default:
      return [];
  }
}

/** Painel gerencial (métricas financeiras/operacionais globais): só Gerência. */
export function podeVerPainelGerencial(role: Role): boolean {
  return role === "gerencia";
}

/** Painel analítico de gargalos da esteira: Gerência, Coordenador e a própria Analista. */
export function podeVerPainelAnalitico(role: Role): boolean {
  return role === "gerencia" || role === "coordenador" || role === "analista";
}

/** Relatórios gerais / insights de imobiliárias: Gerência e Coordenador. */
export function podeVerRelatoriosGerais(role: Role): boolean {
  return role === "gerencia" || role === "coordenador";
}

/** Quem pode importar planilha e disparar o motor de auditoria diária. */
export function podeImportarPlanilha(role: Role): boolean {
  return role === "gerencia" || role === "coordenador";
}

/** Quem pode ver os quadros de tarefas de todo mundo (visão consolidada). */
export function podeVerTodosOsQuadros(role: Role): boolean {
  return role === "gerencia" || role === "coordenador" || role === "analista";
}

/** Motor de Regras Dinâmicas (No-Code): configuração restrita à Gerência. */
export function podeConfigurarRegrasAuditoria(role: Role): boolean {
  return role === "gerencia";
}

/** Dossiê do Cliente (linha do tempo de auditoria de uma pasta): mesma visibilidade da Auditoria de Planilha. */
export function podeVerDossieCliente(role: Role): boolean {
  return role === "gerencia" || role === "coordenador" || role === "analista";
}
