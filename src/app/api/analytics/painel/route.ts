import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { podeVerPainelAnalitico } from "@/lib/auth/roles";
import { autenticar } from "@/lib/server/tarefasManuais";
import { lerDias, lerEvolucaoEtapas, lerTarefasDaJanela } from "@/lib/server/analytics";
import { calcularMapaTreinamento, calcularRankingParceiros } from "@/lib/services/analiseParceiros";
import type { Tarefa } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Painel analítico numa única chamada: evolução por etapa (snapshots) + ranking e mapa de
 * imobiliárias (tarefas). Cada fonte é lida uma vez e as métricas saem de cálculo em memória.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!podeVerPainelAnalitico(auth.role)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }

    const db = getAdminDb();
    const dias = lerDias(req);
    const [evolucao, tarefas] = await Promise.all([lerEvolucaoEtapas(db, dias), lerTarefasDaJanela(db, dias)]);
    const lista = tarefas as Tarefa[];

    return NextResponse.json({
      dias,
      evolucao,
      ranking: calcularRankingParceiros(lista),
      mapa: calcularMapaTreinamento(lista),
      totalTarefas: lista.length,
    });
  } catch (error) {
    console.error("[analytics/painel] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao calcular analytics.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
