"use client";

import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Tarefa } from "@/lib/types";

/**
 * Assistente marca a tarefa como resolvida, registrando a nota de conclusão
 * ("O que foi feito?"). Isso NÃO fecha a tarefa definitivamente: ela vai para
 * "pending_validation" até a próxima importação de planilha confirmar (ou não)
 * o avanço da etapa — ver auditEngine.ts.
 */
export async function marcarTarefaResolvida(tarefa: Tarefa, uid: string, nota: string) {
  await updateDoc(doc(db, "tarefas", tarefa.id), {
    status: "pending_validation",
    resolvidoPor: uid,
    resolvidoEm: new Date().toISOString(),
    etapaNoMomentoResolucao: tarefa.etapa,
    observacaoNoMomentoResolucao: tarefa.observacaoOriginal,
    notaResolucao: nota.trim() || null,
  });
}

/**
 * Devolve a tarefa para o quadro do responsável, pendente e expandida
 * (auditoria humana ou clique por engano). Vale para "pending_validation" e
 * "validated_done"; limpa a marcação de resolução e a nota.
 */
export async function reverterTarefa(tarefaId: string) {
  await updateDoc(doc(db, "tarefas", tarefaId), {
    status: "pendente",
    resolvidoPor: null,
    resolvidoEm: null,
    etapaNoMomentoResolucao: null,
    observacaoNoMomentoResolucao: null,
    notaResolucao: null,
  });
}
