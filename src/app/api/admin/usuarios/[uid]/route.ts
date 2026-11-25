import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { dadosDoSuperior, planejarAcao, type AcaoUsuario } from "@/lib/auth/acoesUsuario";
import {
  COLECAO_PRIVADA,
  autenticarGestor,
  lerPermissoesPorCargo,
  lerUsuarios,
  respostaDeErro,
} from "@/lib/server/usuarios";
import type { UserProfile } from "@/lib/types";

export const runtime = "nodejs";

/** Aplica uma ação do painel (aprovar, pausar, editar, permissões...) sobre um usuário. */
export async function PATCH(req: NextRequest, { params }: { params: { uid: string } }) {
  try {
    const auth = await autenticarGestor(req);
    if (auth instanceof NextResponse) return auth;

    const acao = (await req.json().catch(() => null)) as AcaoUsuario | null;
    if (!acao?.tipo) return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });

    const [todos, salvas] = await Promise.all([lerUsuarios(), lerPermissoesPorCargo()]);
    const alvo = todos.find((u) => u.uid === params.uid);
    if (!alvo) return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });

    const resultado = planejarAcao(auth.perfil, alvo, todos, acao, salvas, new Date().toISOString());
    if (!resultado.ok) return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
    const { perfil, privado } = resultado.plano;

    const db = getAdminDb();
    const lote = db.batch();
    // Merge seguro: só os campos do plano mudam; null apaga apenas aquele campo.
    const campos = Object.fromEntries(Object.entries(perfil).map(([k, v]) => [k, v === null ? FieldValue.delete() : v]));
    lote.update(db.collection("users").doc(alvo.uid), campos);
    if (privado) lote.set(db.collection(COLECAO_PRIVADA).doc(alvo.uid), privado, { merge: true });

    // Quem responde a esta pessoa guarda uma cópia do nome/cargo dela: mantém em dia.
    if ("nome" in perfil || "cargo" in perfil) {
      const atualizado = { ...alvo, ...perfil } as UserProfile;
      for (const sub of todos.filter((u) => u.superiorId === alvo.uid)) {
        lote.update(db.collection("users").doc(sub.uid), dadosDoSuperior(atualizado));
      }
    }
    await lote.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDeErro("admin/usuarios/PATCH", error);
  }
}
