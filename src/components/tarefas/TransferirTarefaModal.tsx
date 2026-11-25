"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth/AuthContext";
import { quadroEfetivoDaTarefa } from "@/lib/auth/roles";
import { transferirTarefa } from "@/lib/services/tarefasService";
import { QUADROS_TRANSFERIVEIS, QUADRO_LABEL } from "@/lib/types";
import type { Quadro, Tarefa } from "@/lib/types";

/** Transferir um cartão para outro quadro (quem tem a permissão "Transferir"). */
export function TransferirTarefaModal({ tarefa, onFechar }: { tarefa: Tarefa; onFechar: () => void }) {
  const { firebaseUser } = useAuth();
  const atual = quadroEfetivoDaTarefa(tarefa);
  const [destino, setDestino] = useState<Quadro | "">("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!destino || !firebaseUser) return;
    setEnviando(true);
    setErro(null);
    try {
      await transferirTarefa(tarefa.id, destino, await firebaseUser.getIdToken());
      onFechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível transferir a tarefa.");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Transferir tarefa" onClose={onFechar}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <p className="text-sm text-ink-secondary dark:text-white/60">Quadro atual: {QUADRO_LABEL[atual]}</p>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Transferir para</span>
          <select className="input-field" value={destino} onChange={(e) => setDestino(e.target.value as Quadro)}>
            <option value="" disabled>
              Selecione o quadro
            </option>
            {QUADROS_TRANSFERIVEIS.filter((q) => q !== atual).map((q) => (
              <option key={q} value={q}>
                {QUADRO_LABEL[q]}
              </option>
            ))}
          </select>
        </label>
        {erro && <p className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={!destino || enviando}>
            {enviando ? "Transferindo…" : "Transferir"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
