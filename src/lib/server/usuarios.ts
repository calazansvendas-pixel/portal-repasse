import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { autenticar, type Autenticado } from "@/lib/server/tarefasManuais";
import type { PermissoesPorCargo } from "@/lib/auth/cargos";
import { temMenu, type MenusPorCargo } from "@/lib/auth/menus";
import type { DadosPessoais } from "@/lib/utils/cadastro";
import type { UserProfile } from "@/lib/types";

/**
 * Dados pessoais sensíveis (CPF, CRECI, telefone, nascimento) ficam FORA de "users": nenhuma regra
 * do Firestore libera esta coleção, então só as rotas de API (Admin SDK) leem e gravam.
 */
export const COLECAO_PRIVADA = "usuarios_privado";
export const DOC_PERMISSOES_CARGO = "configuracoes/permissoesCargos";

export type DadosPrivados = Pick<DadosPessoais, "telefone" | "cpf" | "creci" | "dataNascimento">;
export type UsuarioPainel = UserProfile & Partial<DadosPrivados>;

/** Quem chama precisa estar ativo, poder gerenciar usuários e ter o menu do painel liberado. */
export async function autenticarGestor(req: NextRequest): Promise<Autenticado | NextResponse> {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  // O menu já embute a permissão "gerenciarUsuarios" como requisito.
  if (!temMenu(auth.perfil, "painel_admin")) {
    return NextResponse.json({ erro: "Seu perfil não pode gerenciar usuários." }, { status: 403 });
  }
  return auth;
}

export async function lerUsuarios(): Promise<UserProfile[]> {
  const snap = await getAdminDb().collection("users").get();
  return snap.docs.map((d) => {
    const dados = d.data() as Partial<UserProfile> & { criadoEm?: unknown };
    return { ...dados, nome: dados.nome ?? dados.email ?? d.id, email: dados.email ?? "", uid: d.id } as UserProfile;
  });
}

/** Padrões salvos em "Editar Permissões do Cargo": permissões e menus. */
export async function lerPadroesDosCargos(): Promise<{ permissoes: PermissoesPorCargo; menus: MenusPorCargo }> {
  const dados = (await getAdminDb().doc(DOC_PERMISSOES_CARGO).get()).data();
  return {
    permissoes: (dados?.cargos ?? {}) as PermissoesPorCargo,
    menus: (dados?.menus ?? {}) as MenusPorCargo,
  };
}

export function respostaDeErro(contexto: string, error: unknown) {
  console.error(`[${contexto}] erro:`, error);
  const mensagem = error instanceof Error ? error.message : "Erro inesperado.";
  return NextResponse.json({ erro: mensagem }, { status: 500 });
}
