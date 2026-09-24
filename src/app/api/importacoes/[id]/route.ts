import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";

const LOTE = 450; // margem de segurança abaixo do limite de 500 do Firestore por batch

/**
 * Exclui uma importação (histórico) e tudo o que "nasceu" dela:
 *  - o(s) documento(s) de snapshot com esse importacaoId (registros/*\/snapshots/{id});
 *  - as tarefas cuja importacaoIdCriacao == id (não mexe em tarefas mais antigas
 *    que só foram atualizadas nesse dia — só as criadas por ele);
 *  - o próprio doc de resumo em "importacoes".
 * Não reverte o estado atual das pastas em "registros".
 *
 * Restrito a role === "gerencia", verificado aqui no servidor (além das
 * regras do Firestore, que também travam delete direto pelo client SDK).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const adminAuth = getAdminAuth();
    const adminDb = getAdminDb();

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ erro: "Sessão inválida ou expirada." }, { status: 401 });

    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    const role = userSnap.data()?.role as Role | undefined;
    if (role !== "gerencia") {
      return NextResponse.json(
        { erro: "Somente a Gerência pode excluir uma importação." },
        { status: 403 }
      );
    }

    const importacaoId = params.id;

    const snapshotsSnap = await adminDb
      .collectionGroup("snapshots")
      .where("importacaoId", "==", importacaoId)
      .get();
    const tarefasSnap = await adminDb
      .collection("tarefas")
      .where("importacaoIdCriacao", "==", importacaoId)
      .get();

    const refs = [
      ...snapshotsSnap.docs.map((d) => d.ref),
      ...tarefasSnap.docs.map((d) => d.ref),
      adminDb.collection("importacoes").doc(importacaoId),
    ];

    for (let i = 0; i < refs.length; i += LOTE) {
      const batch = adminDb.batch();
      refs.slice(i, i + LOTE).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    return NextResponse.json({
      importacaoId,
      snapshotsRemovidos: snapshotsSnap.size,
      tarefasRemovidas: tarefasSnap.size,
    });
  } catch (error) {
    console.error("[importacoes/DELETE] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao excluir a importação.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
