import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";

const LOTE = 450; // margem de segurança abaixo do limite de 500 do Firestore por batch

/**
 * Exclusão TOTAL (hard delete) de uma importação — não deixa nenhum vestígio
 * daquele arquivo no app:
 *  1. o doc de resumo em "importacoes";
 *  2. o(s) snapshot(s) daquele dia (registros/*\/snapshots/{id});
 *  3. TODAS as tarefas cuja importacaoIdCriacao == id;
 *  4. TODOS os documentos de "registros" tocados por essa importação (toda
 *     pasta que teve um snapshot com esse importacaoId é apagada por completo
 *     — inclusive pastas que já existiam antes e só foram atualizadas nesse
 *     dia). Não há tentativa de reconstruir o estado anterior da pasta: o
 *     objetivo é o dashboard voltar a refletir exatamente o estado sem essa
 *     planilha, mesmo que isso remova a pasta inteira da esteira.
 *
 * Snapshots de OUTROS dias para a mesma pasta não são tocados (só o vínculo
 * com este importacaoId é eliminado).
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

    // Cada snapshot mora em registros/{numero}/snapshots/{importacaoId} — o
    // pai do pai é o próprio doc da pasta. Deduplica por caminho por segurança.
    const registrosRefsPorPath = new Map<string, FirebaseFirestore.DocumentReference>();
    snapshotsSnap.docs.forEach((d) => {
      const registroRef = d.ref.parent.parent;
      if (registroRef) registrosRefsPorPath.set(registroRef.path, registroRef);
    });
    const registrosRefs = [...registrosRefsPorPath.values()];

    const refs = [
      ...snapshotsSnap.docs.map((d) => d.ref),
      ...tarefasSnap.docs.map((d) => d.ref),
      ...registrosRefs,
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
      registrosRemovidos: registrosRefs.length,
    });
  } catch (error) {
    console.error("[importacoes/DELETE] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao excluir a importação.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
