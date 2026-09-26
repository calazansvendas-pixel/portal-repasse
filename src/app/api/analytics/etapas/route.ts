import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { autenticar } from "@/lib/server/tarefasManuais";
import { podeVerPainelAnalitico } from "@/lib/auth/roles";
import { calcularEvolucaoEtapas, type SnapshotEtapa } from "@/lib/services/analiseEtapas";

export const runtime = "nodejs";

const DIAS_PADRAO = 21;
const DIAS_MAXIMO = 90; // teto da janela de análise (cada dia lê milhares de snapshots)
const LIMITE_SNAPSHOTS = 8000; // proteção contra datasets muito grandes

export async function GET(req: NextRequest) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (!podeVerPainelAnalitico(auth.role)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }
    const adminDb = getAdminDb();

    // Teto obrigatório: valor ausente, inválido ou absurdo nunca vira uma consulta sem limite.
    const pedido = Math.floor(Number(req.nextUrl.searchParams.get("dias") ?? DIAS_PADRAO));
    const dias = Number.isFinite(pedido) ? Math.min(Math.max(pedido, 1), DIAS_MAXIMO) : DIAS_PADRAO;

    const importacoesSnap = await adminDb
      .collection("importacoes")
      .orderBy("id", "desc")
      .limit(dias)
      .get();
    const importacaoIds = importacoesSnap.docs.map((d) => d.id);

    if (importacaoIds.length === 0) {
      return NextResponse.json(calcularEvolucaoEtapas([]));
    }

    const entradas: SnapshotEtapa[] = [];
    const chunks = chunk(importacaoIds, 10);

    for (const grupo of chunks) {
      const snap = await adminDb
        .collectionGroup("snapshots")
        .where("importacaoId", "in", grupo)
        .limit(LIMITE_SNAPSHOTS)
        .get();
      snap.forEach((doc) => {
        const data = doc.data();
        entradas.push({ numero: data.numero, importacaoId: data.importacaoId, etapa: data.etapa });
      });
    }

    const resultado = calcularEvolucaoEtapas(entradas);
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[analytics/etapas] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao calcular analytics.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
