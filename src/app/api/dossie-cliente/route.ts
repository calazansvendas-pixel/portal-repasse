import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { podeVerDossieCliente } from "@/lib/auth/roles";
import { autenticar } from "@/lib/server/tarefasManuais";
import { lerBaseDossie, lerDossieCliente } from "@/lib/server/dossieCliente";

export const runtime = "nodejs";

/**
 * Dossiê do Cliente: `?lista=1` traz as pastas com as movimentações (campo de cliente e filtros);
 * `?numero=` traz a pasta completa (registro + tarefas) para a linha do tempo.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!podeVerDossieCliente(auth.role)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get("lista")) {
      return NextResponse.json(await lerBaseDossie(getAdminDb()));
    }
    const numero = searchParams.get("numero")?.trim();
    if (!numero) return NextResponse.json({ erro: "Informe a pasta." }, { status: 400 });
    const dossie = await lerDossieCliente(getAdminDb(), numero);
    if (!dossie) return NextResponse.json({ erro: "Pasta não encontrada." }, { status: 404 });
    return NextResponse.json(dossie);
  } catch (error) {
    console.error("[dossie-cliente] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao carregar o dossiê.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
