import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { CARGOS_CADASTRO } from "@/lib/auth/cargos";
import { COLECAO_PRIVADA, respostaDeErro } from "@/lib/server/usuarios";
import { lerDadosPessoais } from "@/lib/utils/cadastro";

export const runtime = "nodejs";

const ERROS_AUTH: Record<string, string> = {
  "auth/email-already-exists": "Já existe uma conta com este e-mail.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/invalid-password": "A senha precisa ter pelo menos 6 caracteres.",
};

/**
 * "Criar conta" (rota pública). Todo cadastro nasce `pendente`, com `ativo: false` e SEM `role`:
 * não enxerga nada até um administrador aprovar. O que a pessoa envia de cargo é só a pretensão —
 * nenhum campo de acesso é lido do corpo da requisição.
 */
export async function POST(req: NextRequest) {
  try {
    const corpo = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const dados = lerDadosPessoais(corpo);
    if (typeof dados === "string") return NextResponse.json({ erro: dados }, { status: 400 });

    const email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
    const senha = typeof corpo.senha === "string" ? corpo.senha : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      return NextResponse.json({ erro: "E-mail inválido." }, { status: 400 });
    }
    if (senha.length < 6) {
      return NextResponse.json({ erro: ERROS_AUTH["auth/invalid-password"] }, { status: 400 });
    }
    const cargo = CARGOS_CADASTRO.find((c) => c.id === corpo.cargo)?.id;
    if (!cargo) return NextResponse.json({ erro: "Selecione o cargo pretendido." }, { status: 400 });

    const auth = getAdminAuth();
    let uid: string;
    try {
      uid = (await auth.createUser({ email, password: senha, displayName: dados.nome })).uid;
    } catch (err) {
      const mensagem = ERROS_AUTH[(err as { code?: string }).code ?? ""];
      if (mensagem) return NextResponse.json({ erro: mensagem }, { status: 400 });
      throw err;
    }

    try {
      const db = getAdminDb();
      const { nome, imobiliaria, ...privado } = dados;
      const lote = db.batch();
      lote.create(db.collection("users").doc(uid), {
        nome,
        email,
        imobiliaria,
        cargoPretendido: cargo,
        status: "pendente",
        ativo: false,
        criadoEm: new Date().toISOString(),
      });
      lote.set(db.collection(COLECAO_PRIVADA).doc(uid), privado);
      await lote.commit();
    } catch (err) {
      // Sem perfil a conta ficaria "invisível" no painel: desfaz o login criado.
      await auth.deleteUser(uid).catch(() => {});
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDeErro("cadastro", error);
  }
}
