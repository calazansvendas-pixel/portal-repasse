import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { autenticar } from "@/lib/server/tarefasManuais";

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
 * A exclusão da pasta é EM CASCATA: as subcoleções (snapshots de todos os dias) vão
 * junto, para não sobrar snapshot órfão apontando para uma pasta que não existe mais.
 *
 * Restrito a role === "gerencia", verificado aqui no servidor (além das
 * regras do Firestore, que também travam delete direto pelo client SDK).
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await autenticar(req);
    if (auth instanceof NextResponse) return auth;
    if (auth.role !== "gerencia") {
      return NextResponse.json(
        { erro: "Somente a Gerência pode excluir uma importação." },
        { status: 403 }
      );
    }
    const adminDb = getAdminDb();

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

    // Pastas primeiro, com suas subcoleções (recursiveDelete): nenhum snapshot fica órfão.
    for (const registroRef of registrosRefs) {
      await adminDb.recursiveDelete(registroRef);
    }

    // Snapshots deste dia que não pertençam a uma pasta já apagada (defesa) + tarefas + resumo.
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
      registrosRemovidos: registrosRefs.length,
    });
  } catch (error) {
    console.error("[importacoes/DELETE] erro:", error);
    const mensagem = error instanceof Error ? error.message : "Erro ao excluir a importação.";
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
