import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { autenticar, type Autenticado } from "@/lib/server/tarefasManuais";
import { temPermissao, type PermissoesPorCargo } from "@/lib/auth/cargos";
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

/** Quem chama precisa estar ativo e ter a permissão de gerenciar usuários. */
export async function autenticarGestor(req: NextRequest): Promise<Autenticado | NextResponse> {
  const auth = await autenticar(req);
  if (auth instanceof NextResponse) return auth;
  if (!temPermissao(auth.perfil, "gerenciarUsuarios")) {
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

export async function lerPermissoesPorCargo(): Promise<PermissoesPorCargo> {
  const snap = await getAdminDb().doc(DOC_PERMISSOES_CARGO).get();
  return (snap.data()?.cargos ?? {}) as PermissoesPorCargo;
}

export function respostaDeErro(contexto: string, error: unknown) {
  console.error(`[${contexto}] erro:`, error);
  const mensagem = error instanceof Error ? error.message : "Erro inesperado.";
  return NextResponse.json({ erro: mensagem }, { status: 500 });
}
