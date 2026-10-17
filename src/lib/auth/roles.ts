import type { Assistente, Quadro, QuadroEscalonamento, Role, UserProfile } from "@/lib/types";

/** Cidades oferecidas no filtro de /tarefas e mapeamento padrão de praça: a checagem é feita por
 * inclusão normalizada (minúsculas, sem acento), então "Bairro de Fátima" bate com "fatima". A
 * Gerência pode substituir esse padrão por cidade — ver PracaOverrides/resolvePracaPorCidade. */
export const CIDADES_FILTRO: { chave: string; label: string; praca: Assistente }[] = [
  { chave: "serra", label: "Serra", praca: "layza" },
  { chave: "vila velha", label: "Vila Velha", praca: "eliane" },
  { chave: "fatima", label: "Fátima", praca: "catharina" },
  { chave: "camburi", label: "Camburi", praca: "catharina" },
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

/** Agrupamento geográfico para a UI (Motor de Regras e o cartão): Fátima e Camburi aparecem como
 * UMA opção, já que as duas pertencem à mesma praça (Catharina) — mesmo grupo, rótulo único. */
export const PRACAS_FILTRO_UI: { praca: Assistente; label: string }[] = [
  { praca: "layza", label: "Serra" },
  { praca: "eliane", label: "Vila Velha" },
  { praca: "catharina", label: "Fátima/Camburi" },
];

/** A cidade pertence ao grupo geográfico daquela praça — geografia pura, nunca olha overrides (o
 * Mapeamento de Praças decide QUEM cobre o grupo; isto só decide A QUAL grupo a cidade pertence). */
export function cidadePertenceAPraca(cidade: string, praca: Assistente): boolean {
  const alvo = normalize(cidade);
  return CIDADES_FILTRO.filter((c) => c.praca === praca).some((c) => alvo.includes(c.chave));
}

/** Código de etapa, sem o sufixo descritivo: "1.17 - Documentação incompleta" -> "1.17" (mesmo
 * critério usado no Kanban e no Motor de Regras para casar uma etapa-alvo com a etapa da linha). */
export function codigoEtapa(etapa: string): string {
  return etapa.trim().split(" - ")[0]?.trim() || etapa.trim();
}

/** Uma atribuição de Empreendimento + Etapa (Gerência): este colaborador cuida das pastas daquele
 * empreendimento especificamente nas etapas listadas — ex.: Paulo cuida da "Vista dos Colibris" só
 * nas etapas de documentação, o resto segue o roteamento padrão por cidade/etapa. Empreendimentos e
 * etapas são extraídos dinamicamente das pastas já importadas (coleção "registros") — não há
 * cadastro manual de nenhum dos dois; só o vínculo colaborador<->empreendimento<->etapas é
 * configurado pela Gerência. O colaborador pode ser qualquer um com quadro próprio
 * (assistente/coordenador/analista), não só os 3 assistentes regionais, por isso guarda `quadro`
 * junto (mesmo padrão de `pessoaQuadro` no Motor de Regras). */
export interface AtribuicaoEmpreendimento {
  colaboradorId: string;
  colaboradorNome: string;
  quadro: Quadro;
  etapas: string[]; // códigos de etapa (ver codigoEtapa) sob responsabilidade deste colaborador
}

/** Chave = normalize(nome do empreendimento), igual ao nome na coluna "Empreendimento" da planilha
 * (ver LinhaPlanilha.produto em parseSheet.ts). Ausente/undefined numa chave, ou nenhuma etapa da
 * linha batendo nas atribuições cadastradas, = sem responsável fixo: cai no roteamento padrão por
 * cidade (resolvePracaPorCidade) — fallback em cascata, nunca fica sem destino por causa disto. */
export type MatrizEmpreendimentos = Partial<Record<string, AtribuicaoEmpreendimento[]>>;

/** Dados o empreendimento e a etapa da pasta ("Empreendimento"/"Etapa do processo" da planilha),
 * resolve o responsável fixo cadastrado pela Gerência para ESTA etapa específica — ou null se não
 * houver nenhuma atribuição que cubra essa etapa (quem chama cai de volta para
 * resolvePracaPorCidade). */
export function resolveResponsavelPorEmpreendimento(
  produto: string | null | undefined,
  etapa: string | null | undefined,
  matriz?: MatrizEmpreendimentos | null
): AtribuicaoEmpreendimento | null {
  const chaveProduto = normalize(produto ?? "");
  if (!chaveProduto) return null;
  const atribuicoes = matriz?.[chaveProduto];
  if (!atribuicoes?.length) return null;
  const codigo = codigoEtapa(etapa ?? "");
  return atribuicoes.find((a) => a.etapas.includes(codigo)) ?? null;
}

/** Quais praças (quadros de tarefas) o usuário pode enxergar. */
export function pracasVisiveis(profile: UserProfile): Assistente[] {
  const todas: Assistente[] = ["layza", "eliane", "catharina"];
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
      return ["coordenador", "analista", "layza", "eliane", "catharina"];
    case "coordenador":
      return ["analista", "layza", "eliane", "catharina"];
    case "analista":
      return ["layza", "eliane", "catharina"];
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
