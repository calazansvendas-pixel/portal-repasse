import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { podeVerPainelAnalitico } from "@/lib/auth/roles";
import { calcularEvolucaoEtapas, type SnapshotEtapa } from "@/lib/services/analiseEtapas";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";

const DIAS_PADRAO = 21;
const LIMITE_SNAPSHOTS = 8000; // proteção contra datasets muito grandes

export async function GET(req: NextRequest) {
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ erro: "Sessão inválida." }, { status: 401 });

    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const role = userSnap.data()?.role as Role | undefined;
    if (!role || !podeVerPainelAnalitico(role)) {
      return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
    }

    const dias = Number(req.nextUrl.searchParams.get("dias") ?? DIAS_PADRAO);

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
