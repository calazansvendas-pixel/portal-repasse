import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { visiveisPara } from "@/lib/auth/acoesUsuario";
import {
  COLECAO_PRIVADA,
  autenticarGestor,
  lerPadroesDosCargos,
  lerUsuarios,
  respostaDeErro,
  type DadosPrivados,
  type UsuarioPainel,
} from "@/lib/server/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dados do Painel do Administrador: usuários visíveis para quem pede (árvore hierárquica). */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticarGestor(req);
    if (auth instanceof NextResponse) return auth;

    const [todos, padroes] = await Promise.all([lerUsuarios(), lerPadroesDosCargos()]);
    const visiveis = visiveisPara(auth.perfil, todos);
    const db = getAdminDb();
    const privados = visiveis.length
      ? await db.getAll(...visiveis.map((u) => db.collection(COLECAO_PRIVADA).doc(u.uid)))
      : [];
    const porUid = new Map(privados.map((d) => [d.id, d.data() as Partial<DadosPrivados> | undefined]));
    const usuarios: UsuarioPainel[] = visiveis.map((u) => ({ ...u, ...porUid.get(u.uid) }));

    return NextResponse.json({ usuarios, permissoesPorCargo: padroes.permissoes, menusPorCargo: padroes.menus });
  } catch (error) {
    return respostaDeErro("admin/usuarios", error);
  }
}
