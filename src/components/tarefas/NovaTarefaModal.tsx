"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { destinatariosPermitidos } from "@/lib/auth/roles";
import { criarTarefaManual, editarTarefa } from "@/lib/services/tarefasService";
import { QUADRO_LABEL } from "@/lib/types";
import type { Quadro, Tarefa } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

/** Criação (sem "tarefa") ou edição de uma tarefa avulsa existente. */
export function NovaTarefaModal({ onFechar, tarefa }: { onFechar: () => void; tarefa?: Tarefa }) {
  const { firebaseUser, profile } = useAuth();
  const editando = !!tarefa;
  const permitidos: Quadro[] = profile ? destinatariosPermitidos(profile.role) : [];
  // Ao editar, o destinatário atual sempre aparece na lista, mesmo se o editor não puder mais escolhê-lo.
  const destinatarios: Quadro[] =
    tarefa && !permitidos.includes(tarefa.praca) ? [tarefa.praca, ...permitidos] : permitidos;
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? "");
  const [destino, setDestino] = useState<Quadro | "">(tarefa?.praca ?? "");
  const [dataLimite, setDataLimite] = useState(tarefa?.dataLimite ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeEnviar = descricao.trim().length > 0 && destino !== "" && !enviando;

  async function criar() {
    if (!firebaseUser || destino === "") return;
    setEnviando(true);
    setErro(null);
    try {
      const token = await firebaseUser.getIdToken();
      if (tarefa) await editarTarefa(tarefa.id, { descricao, atribuidoPara: destino, dataLimite }, token);
      else await criarTarefaManual(descricao, destino, dataLimite, token);
      onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao criar a tarefa.");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={editando ? "Editar Tarefa" : "Nova Tarefa"} onClose={onFechar}>
      <div className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Descrição da Tarefa</span>
          <textarea
            autoFocus
            rows={5}
            maxLength={1000}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que precisa ser feito?"
            className="w-full resize-none rounded-md border border-border bg-surface p-3 text-sm text-ink-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:border-white/15 dark:bg-[#1B1E17] dark:text-white"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Atribuir para</span>
          <select
            className="input-field"
            value={destino}
            onChange={(e) => setDestino(e.target.value as Quadro | "")}
          >
            <option value="">Selecione o colaborador…</option>
            {destinatarios.map((q) => (
              <option key={q} value={q}>
                {QUADRO_LABEL[q]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Data limite {editando ? "" : "(opcional — padrão: 3 dias úteis)"}
          </span>
          <input
            type="date"
            className="input-field"
            value={dataLimite}
            onChange={(e) => setDataLimite(e.target.value)}
          />
        </label>

        {erro && <p className="text-xs text-status-danger">{erro}</p>}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="btn-secondary h-10" onClick={onFechar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" className="btn-primary h-10" onClick={criar} disabled={!podeEnviar}>
          {editando ? "Salvar Alterações" : "Criar Tarefa"}
        </button>
      </div>
    </Modal>
  );
}
