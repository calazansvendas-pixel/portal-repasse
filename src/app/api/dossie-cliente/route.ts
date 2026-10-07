import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { podeVerDossieCliente } from "@/lib/auth/roles";
import { autenticar } from "@/lib/server/tarefasManuais";
import { buscarCandidatosDossie, lerDossieCliente } from "@/lib/server/dossieCliente";

export const runtime = "nodejs";

const MIN_CARACTERES_BUSCA = 3;

/**
 * Dossiê do Cliente: `?termo=` busca pastas por nome/CPF (lista de candidatos);
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
    const numero = searchParams.get("numero")?.trim();
    const termo = searchParams.get("termo")?.trim();

    if (numero) {
      const dossie = await lerDossieCliente(getAdminDb(), numero);
      if (!dossie) return NextResponse.json({ erro: "Pasta não encontrada." }, { status: 404 });
      return NextResponse.json(dossie);
    }

    if (!termo || termo.length < MIN_CARACTERES_BUSCA) {
      return NextResponse.json({ erro: `Informe ao menos ${MIN_CARACTERES_BUSCA} caracteres para buscar.` }, { status: 400 });
    }
    const candidatos = await buscarCandidatosDossie(getAdminDb(), termo);
    return NextResponse.json({ candidatos });
  } catch (error) {
    console.error("[dossie-cliente] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao carregar o dossiê.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
