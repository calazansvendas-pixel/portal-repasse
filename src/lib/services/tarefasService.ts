"use client";

import { doc, runTransaction, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { ClienteEnvolvido, Quadro, Tarefa } from "@/lib/types";

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
 * Marca/desmarca UM cliente dentro de uma tarefa agregada (gargalo). A tarefa
 * mãe só entra em "pending_validation" quando todos os clientes estão
 * marcados; desmarcar qualquer um a devolve para "pendente". A nota (opcional)
 * é gravada quando este clique completa a tarefa.
 */
export async function alternarClienteEnvolvido(tarefaId: string, numero: string, uid: string, nota = "") {
  const ref = doc(db, "tarefas", tarefaId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const tarefa = snap.data() as Tarefa | undefined;
    if (!tarefa) throw new Error("Tarefa não encontrada.");

    const clientes = (tarefa.clientesEnvolvidos ?? []).map((c) =>
      c.numero === numero ? { ...c, concluido: !c.concluido } : c
    );
    const todosConcluidos = clientes.length > 0 && clientes.every((c) => c.concluido);

    const mudanca: Record<string, unknown> = { clientesEnvolvidos: clientes };
    if (todosConcluidos && tarefa.status !== "pending_validation") {
      Object.assign(mudanca, {
        status: "pending_validation",
        resolvidoPor: uid,
        resolvidoEm: new Date().toISOString(),
        etapaNoMomentoResolucao: tarefa.etapa,
        observacaoNoMomentoResolucao: tarefa.observacaoOriginal,
        notaResolucao: nota.trim() || null,
      });
    } else if (!todosConcluidos && tarefa.status === "pending_validation") {
      Object.assign(mudanca, camposDeTarefaAtiva());
    }
    tx.update(ref, mudanca);
  });
}

function camposDeTarefaAtiva() {
  return {
    status: "pendente",
    resolvidoPor: null,
    resolvidoEm: null,
    etapaNoMomentoResolucao: null,
    observacaoNoMomentoResolucao: null,
    notaResolucao: null,
  };
}

function comClientes(tarefa: Tarefa, concluido: boolean): { clientesEnvolvidos?: ClienteEnvolvido[] } {
  return tarefa.clientesEnvolvidos?.length
    ? { clientesEnvolvidos: tarefa.clientesEnvolvidos.map((c) => ({ ...c, concluido })) }
    : {};
}

/**
 * Devolve a tarefa para o quadro do responsável, pendente e expandida
 * (auditoria humana, clique por engano ou God Mode). Vale para
 * "pending_validation" e "validated_done"; limpa a marcação e a nota e, nas
 * agregadas, desmarca todos os clientes.
 */
export async function reverterTarefa(tarefa: Tarefa) {
  await updateDoc(doc(db, "tarefas", tarefa.id), { ...camposDeTarefaAtiva(), ...comClientes(tarefa, false) });
}

/** God Mode (Gerência): marca a tarefa como feita, com todos os clientes concluídos nas agregadas. */
export async function marcarFeitaPelaGerencia(tarefa: Tarefa, uid: string) {
  await updateDoc(doc(db, "tarefas", tarefa.id), {
    status: "pending_validation",
    resolvidoPor: uid,
    resolvidoEm: new Date().toISOString(),
    etapaNoMomentoResolucao: tarefa.etapa,
    observacaoNoMomentoResolucao: tarefa.observacaoOriginal,
    notaResolucao: "Marcada como feita pela Gerência.",
    ...comClientes(tarefa, true),
  });
}

async function chamarTarefa(metodo: "POST" | "PATCH" | "DELETE", url: string, idToken: string, corpo?: object) {
  const res = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.erro ?? "Falha ao alterar a tarefa.");
  return json as { id: string };
}

/** Cria uma tarefa avulsa (hierarquia de destinatários validada no servidor). dataLimite vazia = padrão. */
export function criarTarefaManual(descricao: string, atribuidoPara: Quadro, dataLimite: string, idToken: string) {
  return chamarTarefa("POST", "/api/tarefas", idToken, { descricao, atribuidoPara, dataLimite });
}

/** Edita texto, responsável e data limite (Gerência em qualquer tarefa; criador nas avulsas). */
export async function editarTarefa(
  id: string,
  campos: { descricao: string; atribuidoPara: Quadro; dataLimite: string },
  idToken: string
) {
  await chamarTarefa("PATCH", `/api/tarefas/${encodeURIComponent(id)}`, idToken, campos);
}

/** Exclusão definitiva (hard delete). */
export async function excluirTarefa(id: string, idToken: string) {
  await chamarTarefa("DELETE", `/api/tarefas/${encodeURIComponent(id)}`, idToken);
}
