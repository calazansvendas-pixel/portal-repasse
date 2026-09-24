"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, Layers, Undo2 } from "lucide-react";
import type { Tarefa } from "@/lib/types";
import { SLA_BADGE_CLASSES, SLA_LABEL } from "@/lib/utils/sla";
import { diasDesde, formatDateBR } from "@/lib/utils/dates";
import { marcarTarefaResolvida, desmarcarTarefaResolvida } from "@/lib/services/tarefasService";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils/cn";

export function TaskCard({ tarefa, somenteLeitura = false }: { tarefa: Tarefa; somenteLeitura?: boolean }) {
  const { firebaseUser } = useAuth();
  const [processando, setProcessando] = useState(false);

  const aguardandoValidacao = tarefa.status === "pending_validation";
  const falhaAuditoria = tarefa.status === "audit_failed";
  const isAgregado = tarefa.origem === "agregado";
  const dias = diasDesde(tarefa.dataEntrada);

  async function toggle() {
    if (!firebaseUser || processando) return;
    setProcessando(true);
    try {
      if (aguardandoValidacao) {
        await desmarcarTarefaResolvida(tarefa.id);
      } else {
        await marcarTarefaResolvida(tarefa, firebaseUser.uid);
      }
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div
      className={cn(
        "surface-card space-y-3 p-4",
        falhaAuditoria && "border-status-danger/50 bg-status-danger/5"
      )}
    >
      {falhaAuditoria && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-status-danger">
          <AlertTriangle size={14} />
          Falha de Auditoria
        </div>
      )}
      {falhaAuditoria && tarefa.falhaAuditoriaMotivo && (
        <p className="text-xs text-status-danger">{tarefa.falhaAuditoriaMotivo}</p>
      )}

      {/* Cabeçalho: cliente + imobiliária */}
      {!isAgregado && (
        <div>
          <p className="text-sm font-semibold leading-snug text-ink-primary dark:text-white">
            {tarefa.clienteNome || "Cliente não identificado"}
          </p>
          <p className="text-xs text-ink-muted">{tarefa.imobiliaria || "Imobiliária não informada"}</p>
        </div>
      )}

      {/* Corpo 1: ação de consultoria/ajuda */}
      <p className="text-sm font-medium leading-snug text-ink-primary dark:text-white">
        {tarefa.descricao}
      </p>

      {/* Corpo 2: o problema, na íntegra, para apoiar a ligação */}
      {tarefa.observacaoOriginal && (
        <div className="rounded-md border border-border bg-surface-secondary/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            O que foi relatado
          </p>
          <p className="text-xs leading-relaxed text-ink-secondary dark:text-white/70">
            {tarefa.observacaoOriginal}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SLA_BADGE_CLASSES[tarefa.slaStatus])}>
          {SLA_LABEL[tarefa.slaStatus]}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-secondary dark:border-white/15 dark:text-white/60">
          {tarefa.tipoPendencia}
        </span>
      </div>

      {/* Rodapé: linha do tempo simples */}
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-ink-muted dark:border-white/10">
        {isAgregado ? (
          <span className="inline-flex items-center gap-1">
            <Layers size={12} />
            {tarefa.numerosRelacionados?.length ?? 0} pastas relacionadas
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1">
            <span>{formatDateBR(tarefa.dataEntrada)}</span>
            <ArrowRight size={11} className="text-ink-muted" />
            <span className="font-medium text-ink-secondary dark:text-white/70">
              {tarefa.etapa || "—"}
            </span>
            {dias !== null && <span>({dias}d)</span>}
          </span>
        )}

        {!somenteLeitura && (
          <button
            type="button"
            onClick={toggle}
            disabled={processando}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
              aguardandoValidacao
                ? "border-status-info/40 bg-status-info/10 text-status-info hover:bg-status-info/15"
                : "border-status-success/40 bg-status-success/10 text-status-success hover:bg-status-success/15"
            )}
          >
            {aguardandoValidacao ? (
              <>
                <Undo2 size={14} />
                Aguardando validação
              </>
            ) : (
              <>
                <Check size={14} />
                Marcar como resolvida
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
