import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { autenticar } from "@/lib/server/tarefasManuais";
import { podeVerPainelAnalitico } from "@/lib/auth/roles";
import { lerDias, lerEvolucaoEtapas } from "@/lib/server/analytics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!podeVerPainelAnalitico(auth.role)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }
    return NextResponse.json(await lerEvolucaoEtapas(getAdminDb(), lerDias(req)));
  } catch (error) {
    console.error("[analytics/etapas] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao calcular analytics.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
