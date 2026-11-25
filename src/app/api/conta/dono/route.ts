import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { EMAIL_DONO, NOME_DONO, calcularPermissoes } from "@/lib/auth/cargos";
import { respostaDeErro } from "@/lib/server/usuarios";

export const runtime = "nodejs";

/**
 * Garante o perfil do Dono: só para o e-mail oficial E com o e-mail confirmado no Firebase Auth.
 * A confirmação é o que impede alguém de criar uma conta com este e-mail e ganhar o acesso máximo;
 * quem controla a caixa de entrada confirma usando "Esqueci minha senha".
 */
export async function POST(req: NextRequest) {
  try {
    const cabecalho = req.headers.get("authorization") ?? "";
    const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : "";
    const decoded = token ? await getAdminAuth().verifyIdToken(token).catch(() => null) : null;
    if (!decoded) return NextResponse.json({ erro: "Sessão inválida ou expirada." }, { status: 401 });
    if (decoded.email?.toLowerCase() !== EMAIL_DONO) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }
    if (decoded.email_verified !== true) {
      return NextResponse.json(
        {
          erro: 'Para ativar o acesso de Dono, confirme o e-mail: clique em "Esqueci minha senha", defina a senha pelo link recebido e entre novamente.',
        },
        { status: 403 }
      );
    }

    const ref = getAdminDb().collection("users").doc(decoded.uid);
    const atual = (await ref.get()).data();
    const agora = new Date().toISOString();
    await ref.set(
      {
        email: EMAIL_DONO,
        nome: atual?.nome || NOME_DONO,
        cargo: "dono",
        role: "gerencia",
        status: "ativo",
        ativo: true,
        recusado: false,
        superiorId: null,
        superiorEmail: null,
        superiorNome: null,
        superiorCargo: null,
        permissoesEfetivas: calcularPermissoes({ cargo: "dono", role: "gerencia" }),
        criadoEm: atual?.criadoEm ?? agora,
        atualizadoEm: agora,
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDeErro("conta/dono", error);
  }
}
