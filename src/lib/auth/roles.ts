import type { Assistente, Role, UserProfile } from "@/lib/types";

/**
 * Mapa fixo de praças -> lista de trechos de "Cidade do empreendimento" que
 * pertencem àquela praça. A checagem é feita por inclusão normalizada
 * (minúsculas, sem acento), então "Bairro de Fátima" bate com "fatima".
 */
export const CITY_ASSIGNMENTS: Record<Assistente, string[]> = {
  laiza: ["serra"],
  eliane: ["vila velha"],
  catarina: ["fatima", "camburi"],
};

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Dada a "Cidade do empreendimento" de uma linha da planilha, resolve a praça responsável. */
export function resolvePracaPorCidade(cidade: string): Assistente | null {
  const alvo = normalize(cidade);
  for (const [praca, trechos] of Object.entries(CITY_ASSIGNMENTS) as [Assistente, string[]][]) {
    if (trechos.some((trecho) => alvo.includes(trecho))) {
      return praca;
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
