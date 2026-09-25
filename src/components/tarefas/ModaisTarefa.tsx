"use client";

import { useState, type ReactNode } from "react";
import { Undo2 } from "lucide-react";
import type { Tarefa } from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils/dates";
import { Modal } from "@/components/ui/Modal";
import { ObservacaoChecklist, TrajetoPasta } from "./partesCard";

export function NotaConclusaoModal({
  onConfirmar,
  onCancelar,
}: {
  onConfirmar: (nota: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    try {
      await onConfirmar(nota);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="O que foi feito? (Opcional)" onClose={onCancelar}>
      <textarea
        autoFocus
        rows={4}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Ex.: Liguei para o corretor, ele vai enviar o RG até amanhã."
        className="w-full resize-none rounded-md border border-border bg-surface p-3 text-sm text-ink-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:border-white/15 dark:bg-[#1B1E17] dark:text-white"
      />
      <div className="mt-4 flex justify-end gap-3">
        <button type="button" className="btn-secondary h-10" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" className="btn-primary h-10" onClick={confirmar} disabled={enviando}>
          Confirmar Conclusão
        </button>
      </div>
    </Modal>
  );
}

export function DetalhesTarefaModal({
  tarefa,
  podeReverter,
  onReverter,
  onFechar,
}: {
  tarefa: Tarefa;
  podeReverter: boolean;
  onReverter: () => Promise<void>;
  onFechar: () => void;
}) {
  const [revertendo, setRevertendo] = useState(false);

  async function reverter() {
    setRevertendo(true);
    try {
      await onReverter();
    } finally {
      setRevertendo(false);
    }
  }

  return (
    <Modal titulo="Detalhes da tarefa" onClose={onFechar}>
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-ink-primary dark:text-white">
            {tarefa.clienteNome || "Cliente não identificado"}
          </p>
          <p className="text-xs text-ink-muted">{tarefa.imobiliaria || "Imobiliária não informada"}</p>
        </div>

        <Secao titulo="Trajeto da pasta">
          <TrajetoPasta tarefa={tarefa} />
        </Secao>

        <Secao titulo="Observação original">
          {tarefa.observacaoOriginal ? (
            <ObservacaoChecklist texto={tarefa.observacaoOriginal} />
          ) : (
            <p className="text-xs text-ink-muted">Sem observação.</p>
          )}
        </Secao>

        <Secao titulo="O que foi feito">
          {tarefa.notaResolucao ? (
            <p className="whitespace-pre-line text-xs leading-relaxed text-ink-secondary dark:text-white/70">
              {tarefa.notaResolucao}
            </p>
          ) : (
            <p className="text-xs text-ink-muted">Nenhuma nota registrada.</p>
          )}
          {tarefa.resolvidoEm && (
            <p className="mt-1 text-[11px] text-ink-muted">Concluída em {formatDateTimeBR(tarefa.resolvidoEm)}</p>
          )}
        </Secao>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        {podeReverter && (
          <button
            type="button"
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-status-danger/40 bg-status-danger/10 px-4 text-sm font-semibold text-status-danger transition-colors hover:bg-status-danger/15 disabled:opacity-50"
            onClick={reverter}
            disabled={revertendo}
          >
            <Undo2 size={16} />
            Reverter / Tarefa Incompleta
          </button>
        )}
        <button type="button" className="btn-secondary h-10" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{titulo}</p>
      {children}
    </div>
  );
}
