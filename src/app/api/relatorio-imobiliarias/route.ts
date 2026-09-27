import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { podeVerRelatoriosGerais } from "@/lib/auth/roles";
import { autenticar } from "@/lib/server/tarefasManuais";
import { lerPastasParaRelatorio, LIMITE_REGISTROS } from "@/lib/server/relatorioImobiliarias";

export const runtime = "nodejs";

/** Relatório read-only de pastas por imobiliária/cidade, para prestação de contas aos parceiros. */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!podeVerRelatoriosGerais(auth.role)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }

    const { pastas, truncado } = await lerPastasParaRelatorio(getAdminDb());
    return NextResponse.json({ pastas, parcial: truncado ? LIMITE_REGISTROS : null });
  } catch (error) {
    console.error("[relatorio-imobiliarias] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao carregar o relatório.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
