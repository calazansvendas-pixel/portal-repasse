// Menus da barra lateral: lista oficial, quem enxerga cada um e qual rota cada um protege.
// Módulo puro: usado pela barra lateral, pelo guard das rotas, pelo Painel do Administrador e pela API.
//
// Precedência (da mais fraca para a mais forte):
//   1. padrão de fábrica, derivado do perfil operacional e das permissões da pessoa;
//   2. o que foi salvo para o cargo em "Editar Permissões do Cargo";
//   3. permissão individual ligada (quem recebeu "Importar" continua vendo a Auditoria);
//   4. chave de menu individual do colaborador.
// Por cima de tudo: o Dono vê sempre os cinco, e nenhum menu abre sem o requisito da própria tela.
import {
  calcularPermissoes,
  ehCargo,
  permissaoTravada,
  type CargoId,
  type PermissaoId,
  type PermissoesPorCargo,
} from "./cargos";
import type { Role, UserProfile } from "@/lib/types";

/** Na ordem em que aparecem na barra lateral. */
export const MENUS = [
  { id: "painel", nome: "Painel", curto: "Ver Painel", rota: "/dashboard" },
  { id: "auditoria", nome: "Auditoria de Planilha", curto: "Ver Auditoria", rota: "/auditoria" },
  { id: "dossie", nome: "Dossiê do Cliente", curto: "Ver Dossiê", rota: "/auditoria/cliente" },
  { id: "motor_regras", nome: "Motor de Regras", curto: "Ver Motor de Regras", rota: "/motor-regras" },
  { id: "painel_admin", nome: "Painel do Administrador", curto: "Ver Painel Admin", rota: "/painel-administrador" },
] as const;

export type MenuId = (typeof MENUS)[number]["id"];
export type MapaMenus = Record<MenuId, boolean>;
export type MenusParciais = Partial<MapaMenus>;
export type MenusPorCargo = Partial<Record<CargoId, MenusParciais>>;

type Permissoes = Record<PermissaoId, boolean>;

export interface BaseMenus {
  cargo?: string | null;
  role?: Role | null;
  permissoesIndividuais?: UserProfile["permissoesIndividuais"];
  menusPermitidos?: MenusParciais | null;
}

const acompanhaOperacao = (role?: Role | null) => role === "gerencia" || role === "coordenador" || role === "analista";

/** Requisito da própria tela. Sem ele o menu abriria uma página vazia ou expor dados indevidos. */
export function motivoIndisponivel(menu: MenuId, role: Role | null | undefined, permissoes: Permissoes): string | null {
  switch (menu) {
    case "auditoria":
      return acompanhaOperacao(role) || permissoes.importarPlanilhas ? null : 'Precisa da permissão "Importar Planilhas"';
    case "dossie":
      return role === "corretor" ? "Corretores não acessam dados de todos os clientes" : null;
    case "motor_regras":
      return permissoes.editarMotorRegras || permissoes.editarParametros ? null : 'Precisa da permissão "Regras" ou "Parâmetros"';
    case "painel_admin":
      return permissoes.gerenciarUsuarios ? null : 'Precisa da permissão "Usuários"';
    default:
      return null;
  }
}

export function menuTravado(cargo: string | null | undefined, menu: MenuId): boolean {
  return cargo === "dono" || (menu === "painel_admin" && permissaoTravada(cargo, "gerenciarUsuarios"));
}

function padraoDeFabrica(role: Role | null | undefined, permissoes: Permissoes): MapaMenus {
  return {
    painel: true,
    auditoria: role === "gerencia" || permissoes.importarPlanilhas,
    dossie: acompanhaOperacao(role),
    motor_regras: permissoes.editarMotorRegras || permissoes.editarParametros,
    painel_admin: permissoes.gerenciarUsuarios,
  };
}

/** Trava do cargo e requisito da tela, aplicados por último. */
function aplicarLimites(mapa: MapaMenus, p: BaseMenus, permissoes: Permissoes): MapaMenus {
  for (const { id } of MENUS) {
    if (menuTravado(p.cargo, id)) mapa[id] = true;
    else if (motivoIndisponivel(id, p.role, permissoes)) mapa[id] = false;
  }
  return mapa;
}

export function calcularMenus(
  p: BaseMenus,
  salvas: PermissoesPorCargo = {},
  menusSalvos: MenusPorCargo = {},
  permissoes: Permissoes = calcularPermissoes(p, salvas)
): MapaMenus {
  const mapa: MapaMenus = {
    ...padraoDeFabrica(p.role, permissoes),
    ...(ehCargo(p.cargo) ? menusSalvos[p.cargo] : {}),
  };
  const ligadas = p.permissoesIndividuais ?? {};
  if (ligadas.importarPlanilhas) mapa.auditoria = true;
  if (ligadas.editarMotorRegras || ligadas.editarParametros) mapa.motor_regras = true;
  if (ligadas.gerenciarUsuarios) mapa.painel_admin = true;
  Object.assign(mapa, p.menusPermitidos ?? {});
  return aplicarLimites(mapa, p, permissoes);
}

export type PerfilComMenus = BaseMenus & Pick<UserProfile, "permissoesEfetivas" | "menusEfetivos">;

/** Menus de quem está logado: o que o painel gravou no perfil ou, sem isso, o calculado. */
export function menusDoPerfil(p: PerfilComMenus): MapaMenus {
  const permissoes = { ...calcularPermissoes(p), ...p.permissoesEfetivas };
  const mapa = { ...calcularMenus(p, {}, {}, permissoes), ...p.menusEfetivos };
  return aplicarLimites(mapa, p, permissoes);
}

export const temMenu = (p: PerfilComMenus, menu: MenuId): boolean => menusDoPerfil(p)[menu];

export function menusVisiveis(p: PerfilComMenus) {
  const mapa = menusDoPerfil(p);
  return MENUS.filter((m) => mapa[m.id]);
}

/** Primeira rota liberada; null quando não há nenhum menu. */
export const primeiraRota = (p: PerfilComMenus): string | null => menusVisiveis(p)[0]?.rota ?? null;

/** Menu que protege um caminho — o de rota mais específica ("/auditoria/cliente" antes de "/auditoria"). */
export function menuDaRota(caminho: string): (typeof MENUS)[number] | null {
  // Endereço antigo dos quadros, que hoje redireciona para o Painel.
  const alvo = caminho === "/tarefas" ? "/dashboard" : caminho;
  return (
    [...MENUS]
      .sort((a, b) => b.rota.length - a.rota.length)
      .find((m) => alvo === m.rota || alvo.startsWith(`${m.rota}/`)) ?? null
  );
}
