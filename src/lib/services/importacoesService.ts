"use client";

export interface ResultadoExclusaoImportacao {
  importacaoId: string;
  snapshotsRemovidos: number;
  tarefasRemovidas: number;
  registrosRemovidos: number;
}

/** Chama a rota admin que exclui TOTALMENTE uma importação: resumo, snapshots, tarefas e as pastas (registros) que ela tocou. */
export async function excluirImportacao(
  importacaoId: string,
  idToken: string
): Promise<ResultadoExclusaoImportacao> {
  const res = await fetch(`/api/importacoes/${encodeURIComponent(importacaoId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.erro ?? "Falha ao excluir a importação.");
  return json as ResultadoExclusaoImportacao;
}
