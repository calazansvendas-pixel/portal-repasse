// Cargos oficiais Morar, status de conta, permissões e hierarquia. Módulo puro (sem Firebase):
// usado pela interface, pelas rotas de API e pelos testes.
//
// Compatibilidade: `role` (perfil operacional), `praca` e `ativo` continuam sendo o que as regras do
// Firestore e o roteamento de tarefas leem. `cargo` e `status` são campos NOVOS; um perfil antigo sem
// eles segue funcionando exatamente como antes (bloco "Outros / Legado" no Painel do Administrador).
import type { Role, UserProfile } from "@/lib/types";

/** Os 14 cargos oficiais, na ordem hierárquica (o primeiro é o mais alto). */
export const CARGOS = [
  { id: "dono", nome: "Dono", role: "gerencia" },
  { id: "administrador", nome: "Administrador", role: "gerencia" },
  { id: "diretor_vendas", nome: "Diretor de Vendas", role: "gerencia" },
  { id: "diretor_credito", nome: "Diretor de Crédito", role: "gerencia" },
  { id: "gerente_vendas_interno", nome: "Gerente de Vendas Interno", role: "gerencia" },
  { id: "gerente_vendas_externo", nome: "Gerente de Vendas Externo", role: "gerencia" },
  { id: "coordenador_vendas", nome: "Coordenador de Vendas", role: "coordenador" },
  { id: "coordenador_credito", nome: "Coordenador de Crédito", role: "coordenador" },
  { id: "analista_vendas", nome: "Analista de Vendas", role: "analista" },
  { id: "analista_credito", nome: "Analista de Crédito", role: "analista" },
  { id: "assistente_vendas", nome: "Assistente de Vendas", role: "assistente" },
  { id: "assistente_credito", nome: "Assistente de Crédito", role: "assistente" },
  { id: "corretor_associado", nome: "Corretor Associado", role: "corretor" },
  { id: "corretor_parceiro", nome: "Corretor Parceiro", role: "corretor" },
] as const satisfies readonly { id: string; nome: string; role: Role }[];

export type CargoId = (typeof CARGOS)[number]["id"];

export function ehCargo(valor: unknown): valor is CargoId {
  return CARGOS.some((c) => c.id === valor);
}

/** Nome de um cargo oficial; null se o valor não é um deles. */
export function nomeDoCargo(cargo: string | null | undefined): string | null {
  return CARGOS.find((c) => c.id === cargo)?.nome ?? null;
}

/** Perfil operacional (o que o portal e as regras usam) que um cargo recebe. */
export function roleDoCargo(cargo: CargoId): Role {
  return CARGOS.find((c) => c.id === cargo)!.role;
}

/** Cargos que a própria pessoa pode pretender no "Criar conta" — nunca Dono nem Administrador. */
export const CARGOS_CADASTRO = CARGOS.filter((c) => c.id !== "dono" && c.id !== "administrador");

/** Cargos anteriores à padronização, exibidos em "Outros / Legado" até a reclassificação. */
export const ROTULO_LEGADO: Record<Role, string> = {
  gerencia: "Gerente",
  coordenador: "Coordenador",
  analista: "Analista",
  assistente: "Assistente",
  corretor: "Corretor",
};

export function rotuloDoPerfil(p: { cargo?: string | null; role?: Role | null }): string {
  return nomeDoCargo(p.cargo) ?? (p.role ? ROTULO_LEGADO[p.role] : "Sem cargo");
}

// ---------------------------------------------------------------------------------------- status

export type StatusConta = "pendente" | "ativo" | "pausado" | "excluido";

/** Perfis antigos não têm `status`: vale o `ativo` que eles já tinham. */
export function statusDoPerfil(p: { status?: StatusConta | null; ativo?: boolean | null }): StatusConta {
  return p.status ?? (p.ativo === true ? "ativo" : "pausado");
}

export const MENSAGEM_STATUS: Record<Exclude<StatusConta, "ativo">, { titulo: string; texto: string }> = {
  pendente: {
    titulo: "Aguardando aprovação",
    texto: "Seu cadastro ainda está aguardando aprovação de um administrador.",
  },
  pausado: {
    titulo: "Conta pausada",
    texto: "Essa conta está pausada. Fale com quem administra o Portal de Repasse.",
  },
  excluido: {
    titulo: "Conta excluída",
    texto: "Essa conta foi excluída. Fale com quem administra o Portal de Repasse.",
  },
};

/** E-mail do Dono do aplicativo (provisionado no primeiro acesso com e-mail confirmado). */
export const EMAIL_DONO = "calazansvendas@gmail.com";
export const NOME_DONO = "Rafael Calazans";

/** Papéis que o Dono do aplicativo exerce junto com o próprio cargo, num único cadastro. */
const ACUMULADOS_DO_DONO: CargoId[] = ["administrador", "gerente_vendas_externo"];

export function cargosAcumulados(p: { cargo?: string | null; email?: string | null }): CargoId[] {
  return p.cargo === "dono" && p.email?.toLowerCase() === EMAIL_DONO ? ACUMULADOS_DO_DONO : [];
}

/** Cargo exibido, incluindo os acumulados: "Dono · Administrador · Gerente de Vendas Externo". */
export function rotuloCompleto(p: { cargo?: string | null; role?: Role | null; email?: string | null }): string {
  return [rotuloDoPerfil(p), ...cargosAcumulados(p).map((c) => nomeDoCargo(c))].join(" · ");
}

// ------------------------------------------------------------------------------------ permissões

export const PERMISSOES = [
  { id: "gerenciarUsuarios", nome: "Gerenciar Cadastro de Usuários / Aprovar Acessos / Alterar Cargos", curto: "Usuários" },
  { id: "importarPlanilhas", nome: "Importar Planilhas / Executar Auditoria", curto: "Importar" },
  { id: "editarMotorRegras", nome: "Editar Motor de Regras / Criar ou Alterar Gatilhos", curto: "Regras" },
  { id: "editarParametros", nome: "Editar Parâmetros Comerciais / Empreendimentos / Praças", curto: "Parâmetros" },
  { id: "transferirTarefas", nome: "Transferir / Reatribuir Tarefas de Outros Colaboradores", curto: "Transferir" },
  { id: "exportarRelatorios", nome: "Exportar Relatórios Executivos", curto: "Exportar" },
] as const;

export type PermissaoId = (typeof PERMISSOES)[number]["id"];
export type MapaPermissoes = Record<PermissaoId, boolean>;
export type PermissoesParciais = Partial<MapaPermissoes>;
export type PermissoesPorCargo = Partial<Record<CargoId, PermissoesParciais>>;

function mapa(liberadas: PermissaoId[]): MapaPermissoes {
  return Object.fromEntries(PERMISSOES.map((p) => [p.id, liberadas.includes(p.id)])) as MapaPermissoes;
}

const TODAS = PERMISSOES.map((p) => p.id);

/** Padrão por perfil operacional: reproduz o que cada função já podia fazer antes dos cargos. */
const PADRAO_POR_ROLE: Record<Role, PermissaoId[]> = {
  gerencia: TODAS,
  coordenador: ["importarPlanilhas", "transferirTarefas", "exportarRelatorios"],
  analista: ["exportarRelatorios"],
  assistente: [],
  corretor: [],
};

/** Padrão de fábrica de um cargo. Gerenciar usuários nasce só com Dono e Administrador. */
export function padraoDoCargo(cargo: CargoId): MapaPermissoes {
  const padrao = mapa(PADRAO_POR_ROLE[roleDoCargo(cargo)]);
  padrao.gerenciarUsuarios = cargo === "dono" || cargo === "administrador";
  return padrao;
}

/** Permissões que nunca podem ser desligadas naquele cargo. */
export function permissaoTravada(cargo: string | null | undefined, permissao: PermissaoId): boolean {
  return cargo === "dono" || (cargo === "administrador" && permissao === "gerenciarUsuarios");
}

interface BasePermissoes {
  cargo?: string | null;
  role?: Role | null;
  permissoesIndividuais?: PermissoesParciais | null;
}

/** Padrão do cargo (com o que foi salvo no painel) ou, para legados, o padrão do perfil operacional. */
export function padraoDoPerfil(p: BasePermissoes, salvas: PermissoesPorCargo = {}): MapaPermissoes {
  if (ehCargo(p.cargo)) return { ...padraoDoCargo(p.cargo), ...salvas[p.cargo] };
  return mapa(p.role ? PADRAO_POR_ROLE[p.role] : []);
}

export function calcularPermissoes(p: BasePermissoes, salvas: PermissoesPorCargo = {}): MapaPermissoes {
  const resultado = { ...padraoDoPerfil(p, salvas), ...(p.permissoesIndividuais ?? {}) };
  for (const { id } of PERMISSOES) if (permissaoTravada(p.cargo, id)) resultado[id] = true;
  return resultado;
}

/** O que o perfil pode fazer agora: o valor gravado pelo painel ou, sem ele, o padrão. */
export function temPermissao(
  perfil: Pick<UserProfile, "cargo" | "role" | "permissoesIndividuais" | "permissoesEfetivas">,
  permissao: PermissaoId
): boolean {
  return perfil.permissoesEfetivas?.[permissao] ?? calcularPermissoes(perfil)[permissao];
}

// ------------------------------------------------------------------------------------ hierarquia

/** Posição hierárquica (1 = Dono). Legados valem o nível equivalente; a Gerência antiga, o de Administrador. */
export function nivelHierarquico(p: { cargo?: string | null; role?: Role | null }): number {
  const indice = CARGOS.findIndex((c) => c.id === p.cargo);
  if (indice >= 0) return indice + 1;
  const legado: Record<Role, number> = { gerencia: 2, coordenador: 7, analista: 9, assistente: 11, corretor: 13 };
  return p.role ? legado[p.role] : CARGOS.length;
}

/** Todos os subordinados diretos e indiretos de uma pessoa (pela cadeia de `superiorId`). */
export function descendentesDe(uid: string, todos: { uid: string; superiorId?: string | null }[]): Set<string> {
  const resultado = new Set<string>();
  const fila = [uid];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    for (const p of todos) {
      if (p.superiorId === atual && p.uid !== uid && !resultado.has(p.uid)) {
        resultado.add(p.uid);
        fila.push(p.uid);
      }
    }
  }
  return resultado;
}
