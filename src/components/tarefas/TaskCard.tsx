"use client";

import { useState } from "react";
import { AlertTriangle, Check, Clock3, Layers, Undo2 } from "lucide-react";
import type { Tarefa } from "@/lib/types";
import { SLA_BADGE_CLASSES, SLA_LABEL } from "@/lib/utils/sla";
import { formatDateBR } from "@/lib/utils/dates";
import { marcarTarefaResolvida, desmarcarTarefaResolvida } from "@/lib/services/tarefasService";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils/cn";

export function TaskCard({ tarefa, somenteLeitura = false }: { tarefa: Tarefa; somenteLeitura?: boolean }) {
  const { firebaseUser } = useAuth();
  const [processando, setProcessando] = useState(false);

  const aguardandoValidacao = tarefa.status === "pending_validation";
  const falhaAuditoria = tarefa.status === "audit_failed";

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
        "surface-card p-4",
        falhaAuditoria && "border-status-danger/50 bg-status-danger/5"
      )}
    >
      {falhaAuditoria && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-status-danger">
          <AlertTriangle size={14} />
          Falha de Auditoria
        </div>
      )}

      <p className="mb-3 text-sm font-medium leading-snug text-ink-primary dark:text-white">
        {tarefa.descricao}
      </p>

      {falhaAuditoria && tarefa.falhaAuditoriaMotivo && (
        <p className="mb-3 text-xs text-status-danger">{tarefa.falhaAuditoriaMotivo}</p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SLA_BADGE_CLASSES[tarefa.slaStatus])}>
          {SLA_LABEL[tarefa.slaStatus]}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-secondary dark:border-white/15 dark:text-white/60">
          {tarefa.tipoPendencia}
        </span>
        {tarefa.etapa && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-secondary dark:border-white/15 dark:text-white/60">
            Etapa {tarefa.etapa}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-ink-muted">
        {tarefa.origem === "agregado" ? (
          <span className="inline-flex items-center gap-1">
            <Layers size={12} />
            {tarefa.numerosRelacionados?.length ?? 0} pastas relacionadas
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Clock3 size={12} />
            Prazo: {formatDateBR(tarefa.prazoEtapa)}
          </span>
        )}

        {!somenteLeitura && (
          <button
            type="button"
            onClick={toggle}
            disabled={processando}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
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
