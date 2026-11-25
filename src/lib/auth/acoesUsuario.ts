// Regras das ações do Painel do Administrador. Módulo puro: recebe quem age, o alvo e a lista de
// perfis e devolve o que gravar (ou o motivo da recusa). A rota de API aplica; a tela usa as mesmas
// travas para desabilitar botões.
import type { Assistente, UserProfile } from "@/lib/types";
import {
  PERMISSOES,
  calcularPermissoes,
  descendentesDe,
  ehCargo,
  nivelHierarquico,
  nomeDoCargo,
  roleDoCargo,
  rotuloDoPerfil,
  statusDoPerfil,
  temPermissao,
  type PermissoesParciais,
  type PermissoesPorCargo,
} from "./cargos";
import { MENUS, calcularMenus, temMenu, type MenusParciais, type MenusPorCargo } from "./menus";
import { lerDadosPessoais, type DadosPessoais } from "@/lib/utils/cadastro";

export type AcaoUsuario =
  | { tipo: "aprovar"; cargo: string; praca?: string | null }
  | { tipo: "recusar" | "pausar" | "reativar" | "excluir" | "restaurar" }
  | {
      tipo: "editar";
      dados: Partial<DadosPessoais>;
      cargo?: string | null;
      praca?: string | null;
      superiorId?: string | null;
      permissoesIndividuais?: PermissoesParciais;
      menusPermitidos?: MenusParciais;
    }
  | { tipo: "permissoes"; permissoesIndividuais: PermissoesParciais; menusPermitidos?: MenusParciais };

export interface Plano {
  /** Campos a gravar em users/{uid}; null = apagar o campo. */
  perfil: Record<string, unknown>;
  /** Campos a gravar em usuarios_privado/{uid}. */
  privado: Partial<DadosPessoais> | null;
}

export type Resultado = { ok: true; plano: Plano } | { ok: false; erro: string; status: number };

const PRACAS: Assistente[] = ["layza", "eliane", "catharina"];
const PROTEGIDOS = ["dono", "administrador"];

/** Quem enxerga a base inteira; os demais gestores veem a própria árvore e os cadastros pendentes. */
export function enxergaTodos(ator: UserProfile): boolean {
  return nivelHierarquico(ator) <= 2;
}

export function visiveisPara(ator: UserProfile, todos: UserProfile[]): UserProfile[] {
  if (enxergaTodos(ator)) return todos;
  const equipe = descendentesDe(ator.uid, todos);
  return todos.filter((u) => u.uid === ator.uid || equipe.has(u.uid) || statusDoPerfil(u) === "pendente");
}

/** Motivo pelo qual o ator não pode mexer neste alvo; null = pode. */
export function travaDoAlvo(ator: UserProfile, alvo: UserProfile, todos: UserProfile[]): string | null {
  if (!temPermissao(ator, "gerenciarUsuarios")) return "Seu perfil não pode gerenciar usuários.";
  if (!visiveisPara(ator, todos).some((u) => u.uid === alvo.uid)) return "Esta pessoa não está na sua equipe.";
  if (alvo.cargo === "dono" && ator.cargo !== "dono") return "Só um Dono altera a conta de um Dono.";
  const pendente = statusDoPerfil(alvo) === "pendente";
  if (alvo.uid !== ator.uid && !pendente && nivelHierarquico(alvo) < nivelHierarquico(ator)) {
    return "Você não pode alterar alguém acima do seu nível.";
  }
  return null;
}

export function travaPausaOuExclusao(ator: UserProfile, alvo: UserProfile): string | null {
  if (alvo.uid === ator.uid) return "Você não pode pausar ou excluir a própria conta.";
  if (PROTEGIDOS.includes(alvo.cargo ?? "")) return "Contas de Dono e Administrador não podem ser pausadas nem excluídas.";
  return null;
}

/** Motivo pelo qual o ator não pode atribuir este cargo; null = pode. */
export function travaDoCargo(ator: UserProfile, cargo: string): string | null {
  if (!ehCargo(cargo)) return "Cargo inválido.";
  if (cargo === "dono" && ator.cargo !== "dono") return "Só um Dono atribui o cargo de Dono.";
  if (nivelHierarquico({ cargo }) < nivelHierarquico(ator)) return "Você não pode atribuir um cargo acima do seu.";
  return null;
}

/** Superiores possíveis: contas ativas, fora a própria pessoa e a equipe abaixo dela (evita ciclo). */
export function superioresPossiveis(alvoUid: string, todos: UserProfile[]): UserProfile[] {
  const abaixo = descendentesDe(alvoUid, todos);
  return todos
    .filter((u) => u.uid !== alvoUid && !abaixo.has(u.uid) && statusDoPerfil(u) === "ativo")
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const falha = (erro: string, status = 403): Resultado => ({ ok: false, erro, status });

/** Campos que mudam juntos quando o cargo muda (perfil operacional e quadro de tarefas). */
function camposDoCargo(cargo: string, praca: string | null | undefined): Record<string, unknown> | string {
  if (!ehCargo(cargo)) return "Cargo inválido.";
  const role = roleDoCargo(cargo);
  if (role !== "assistente") return { cargo, role, praca: null };
  if (!PRACAS.includes(praca as Assistente)) return "Escolha a praça (quadro de tarefas) deste assistente.";
  return { cargo, role, praca };
}

function validarPermissoes(ator: UserProfile, alvo: UserProfile, novas: PermissoesParciais): string | null {
  if (alvo.uid === ator.uid) return "Você não pode alterar as próprias permissões.";
  for (const { id, curto } of PERMISSOES) {
    const valor = novas[id];
    if (valor === undefined) continue;
    if (typeof valor !== "boolean") return "Permissão inválida.";
    const mudou = valor !== alvo.permissoesIndividuais?.[id];
    if (mudou && valor && !temPermissao(ator, id)) return `Você não pode liberar "${curto}" porque não tem essa permissão.`;
  }
  return null;
}

function limparPermissoes(novas: PermissoesParciais): PermissoesParciais {
  const limpo: PermissoesParciais = {};
  for (const { id } of PERMISSOES) if (typeof novas[id] === "boolean") limpo[id] = novas[id];
  return limpo;
}

/** Mesmas travas das permissões: ninguém mexe no próprio menu nem libera o que não enxerga. */
function validarMenus(ator: UserProfile, alvo: UserProfile, novos: MenusParciais): string | null {
  if (alvo.uid === ator.uid) return "Você não pode alterar os próprios menus.";
  for (const { id, nome } of MENUS) {
    const valor = novos[id];
    if (valor === undefined) continue;
    if (typeof valor !== "boolean") return "Menu inválido.";
    const mudou = valor !== alvo.menusPermitidos?.[id];
    if (mudou && valor && !temMenu(ator, id)) return `Você não pode liberar o menu "${nome}" porque não tem acesso a ele.`;
  }
  return null;
}

function limparMenus(novos: MenusParciais): MenusParciais {
  const limpo: MenusParciais = {};
  for (const { id } of MENUS) if (typeof novos[id] === "boolean") limpo[id] = novos[id];
  return limpo;
}

export function planejarAcao(
  ator: UserProfile,
  alvo: UserProfile,
  todos: UserProfile[],
  acao: AcaoUsuario,
  salvas: PermissoesPorCargo,
  agora: string,
  menusSalvos: MenusPorCargo = {}
): Resultado {
  const trava = travaDoAlvo(ator, alvo, todos);
  if (trava) return falha(trava);
  const status = statusDoPerfil(alvo);
  const proprio = alvo.uid === ator.uid;
  const perfil: Record<string, unknown> = {};
  let privado: Partial<DadosPessoais> | null = null;

  const mudarStatus = (novo: "pendente" | "ativo" | "pausado" | "excluido") => {
    perfil.status = novo;
    perfil.ativo = novo === "ativo";
  };

  switch (acao.tipo) {
    case "aprovar": {
      if (status !== "pendente") return falha("Este cadastro não está pendente.", 409);
      const travaCargo = travaDoCargo(ator, acao.cargo);
      if (travaCargo) return falha(travaCargo);
      const campos = camposDoCargo(acao.cargo, acao.praca);
      if (typeof campos === "string") return falha(campos, 400);
      Object.assign(perfil, campos, { aprovadoPor: ator.uid, aprovadoEm: agora });
      mudarStatus("ativo");
      break;
    }
    case "recusar":
      if (status !== "pendente") return falha("Este cadastro não está pendente.", 409);
      mudarStatus("excluido");
      perfil.recusado = true;
      break;
    case "pausar":
    case "excluir": {
      const protegido = travaPausaOuExclusao(ator, alvo);
      if (protegido) return falha(protegido);
      if (acao.tipo === "pausar" && status !== "ativo") return falha("Só uma conta ativa pode ser pausada.", 409);
      mudarStatus(acao.tipo === "pausar" ? "pausado" : "excluido");
      if (acao.tipo === "excluir") perfil.recusado = false;
      break;
    }
    case "reativar":
      if (status !== "pausado") return falha("Esta conta não está pausada.", 409);
      if (!alvo.role) return falha("Esta conta não tem cargo. Edite e escolha um antes de reativar.", 409);
      mudarStatus("ativo");
      break;
    case "restaurar":
      if (status !== "excluido") return falha("Esta conta não está excluída.", 409);
      // Cadastro recusado (ou sem perfil operacional) volta para a fila de aprovação.
      mudarStatus(alvo.recusado || !alvo.role ? "pendente" : "ativo");
      perfil.recusado = false;
      break;
    case "permissoes": {
      const erro = validarPermissoes(ator, alvo, acao.permissoesIndividuais);
      if (erro) return falha(erro);
      perfil.permissoesIndividuais = limparPermissoes(acao.permissoesIndividuais);
      if (acao.menusPermitidos) {
        const erroMenus = validarMenus(ator, alvo, acao.menusPermitidos);
        if (erroMenus) return falha(erroMenus);
        perfil.menusPermitidos = limparMenus(acao.menusPermitidos);
      }
      break;
    }
    case "editar": {
      const dados = lerDadosPessoais(acao.dados, { parcial: true });
      if (typeof dados === "string") return falha(dados, 400);
      const { nome, imobiliaria, ...sensiveis } = dados;
      if (nome !== undefined) perfil.nome = nome;
      if (imobiliaria !== undefined) perfil.imobiliaria = imobiliaria;
      if (Object.keys(sensiveis).length > 0) privado = sensiveis;

      const cargoNovo = acao.cargo || null;
      const mudaCargo = !!cargoNovo && cargoNovo !== alvo.cargo;
      const mudaPraca = !!acao.praca && acao.praca !== alvo.praca;
      if (mudaCargo || mudaPraca) {
        if (proprio) return falha("Você não pode trocar o próprio cargo.");
        const cargoFinal = cargoNovo ?? alvo.cargo;
        if (cargoFinal) {
          const travaCargo = mudaCargo ? travaDoCargo(ator, cargoFinal) : null;
          if (travaCargo) return falha(travaCargo);
          const campos = camposDoCargo(cargoFinal, acao.praca ?? alvo.praca);
          if (typeof campos === "string") return falha(campos, 400);
          Object.assign(perfil, campos);
        } else {
          // Legado ainda não reclassificado: só a praça do assistente pode mudar.
          if (alvo.role !== "assistente" || !PRACAS.includes(acao.praca as Assistente)) {
            return falha("Escolha um cargo oficial para alterar a praça.", 400);
          }
          perfil.praca = acao.praca;
        }
      }

      // Superior Hierárquico: obrigatório para todos, exceto o Dono (topo) e a própria conta.
      const cargoFinal = (perfil.cargo as string | undefined) ?? alvo.cargo;
      if (!proprio) {
        if (cargoFinal === "dono") {
          Object.assign(perfil, { superiorId: null, superiorEmail: null, superiorNome: null, superiorCargo: null });
        } else {
          if (!acao.superiorId) return falha("Escolha o Superior Hierárquico.", 400);
          if (acao.superiorId !== alvo.superiorId) {
            const superior = superioresPossiveis(alvo.uid, todos).find((u) => u.uid === acao.superiorId);
            if (!superior) return falha("Superior inválido: escolha uma conta ativa que não esteja abaixo desta pessoa.", 400);
            Object.assign(perfil, dadosDoSuperior(superior));
          }
        }
      }

      if (acao.permissoesIndividuais && !proprio) {
        const erro = validarPermissoes(ator, alvo, acao.permissoesIndividuais);
        if (erro) return falha(erro);
        perfil.permissoesIndividuais = limparPermissoes(acao.permissoesIndividuais);
      }
      if (acao.menusPermitidos && !proprio) {
        const erro = validarMenus(ator, alvo, acao.menusPermitidos);
        if (erro) return falha(erro);
        perfil.menusPermitidos = limparMenus(acao.menusPermitidos);
      }
      break;
    }
    default:
      return falha("Ação desconhecida.", 400);
  }

  // Recalcula o efetivo (é o que a interface e as regras do Firestore consultam).
  const depois = { ...alvo, ...perfil } as UserProfile;
  const mexeuEmAcesso = ["cargo", "permissoesIndividuais", "menusPermitidos"].some((campo) => campo in perfil);
  if (mexeuEmAcesso) {
    perfil.permissoesEfetivas = calcularPermissoes(depois, salvas);
    perfil.menusEfetivos = calcularMenus(depois, salvas, menusSalvos);
  }
  perfil.atualizadoEm = agora;
  return { ok: true, plano: { perfil, privado } };
}

/** Cópia do superior gravada no subordinado. */
export function dadosDoSuperior(superior: UserProfile) {
  return {
    superiorId: superior.uid,
    superiorEmail: superior.email,
    superiorNome: superior.nome,
    superiorCargo: nomeDoCargo(superior.cargo) ?? rotuloDoPerfil(superior),
  };
}
