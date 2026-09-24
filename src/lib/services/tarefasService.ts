"use client";

import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Tarefa } from "@/lib/types";

/**
 * Assistente marca a tarefa como resolvida. Isso NÃO fecha a tarefa definitivamente:
 * ela some da lista de pendentes e vai para "pending_validation" até a próxima
 * importação de planilha confirmar (ou não) o avanço da etapa — ver auditEngine.ts.
 */
export async function marcarTarefaResolvida(tarefa: Tarefa, uid: string) {
  await updateDoc(doc(db, "tarefas", tarefa.id), {
    status: "pending_validation",
    resolvidoPor: uid,
    resolvidoEm: new Date().toISOString(),
    etapaNoMomentoResolucao: tarefa.etapa,
    observacaoNoMomentoResolucao: tarefa.observacaoOriginal,
  });
}

/** Desfaz a marcação de "resolvida" (a assistente errou o clique / voltou atrás). */
export async function desmarcarTarefaResolvida(tarefaId: string) {
  await updateDoc(doc(db, "tarefas", tarefaId), {
    status: "pendente",
    resolvidoPor: null,
    resolvidoEm: null,
    etapaNoMomentoResolucao: null,
    observacaoNoMomentoResolucao: null,
  });
}
