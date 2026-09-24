"use client";

import { useState } from "react";
import { AlertTriangle, Check, Layers, Undo2 } from "lucide-react";
import type { Tarefa } from "@/lib/types";
import { SLA_BADGE_CLASSES, SLA_LABEL } from "@/lib/utils/sla";
import { formatDateBR } from "@/lib/utils/dates";
import { fatiarObservacao } from "@/lib/utils/texto";
import { marcarTarefaResolvida, desmarcarTarefaResolvida } from "@/lib/services/tarefasService";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils/cn";

interface PassoTrajeto {
  titulo: string;
  data: string | null;
}

export function TaskCard({ tarefa, somenteLeitura = false }: { tarefa: Tarefa; somenteLeitura?: boolean }) {
  const { firebaseUser } = useAuth();
  const [processando, setProcessando] = useState(false);

  const aguardandoValidacao = tarefa.status === "pending_validation";
  const falhaAuditoria = tarefa.status === "audit_failed";
  const isAgregado = tarefa.origem === "agregado";
  const itensObservacao = fatiarObservacao(tarefa.observacaoOriginal);

  const passos: PassoTrajeto[] = [
    ...(tarefa.dataEntrada ? [{ titulo: "Entrada", data: tarefa.dataEntrada }] : []),
    ...(tarefa.historicoEtapas ?? []).map((h) => ({ titulo: `Etapa ${h.etapa}`, data: h.data })),
  ];
  if (passos.length === 0 && tarefa.etapa) {
    passos.push({ titulo: `Etapa ${tarefa.etapa}`, data: null });
  }

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

      {/* Corpo 2: o problema, em checklist, para apoiar a ligação */}
      {itensObservacao.length > 0 && (
        <div className="rounded-md border border-border bg-surface-secondary/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            O que foi relatado
          </p>
          <ul className="space-y-1">
            {itensObservacao.map((item, i) => (
              <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-ink-secondary dark:text-white/70">
                <span className="mt-0.5 shrink-0 text-ink-muted">▢</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
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

      {/* Rodapé: trajeto da pasta (stepper vertical) ou pastas relacionadas em agregados */}
      <div className="border-t border-border pt-3 dark:border-white/10">
        {isAgregado ? (
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <Layers size={12} />
            {tarefa.numerosRelacionados?.length ?? 0} pastas relacionadas
          </span>
        ) : (
          <ol>
            {passos.map((passo, i) => {
              const ultimo = i === passos.length - 1;
              return (
                <li key={i} className="flex gap-2">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                        ultimo ? "bg-brand-primary" : "bg-border dark:bg-white/25"
                      )}
                    />
                    {!ultimo && <span className="w-px flex-1 bg-border dark:bg-white/15" />}
                  </div>
                  <div className={cn("flex flex-1 items-center justify-between gap-2", !ultimo && "pb-2")}>
                    <span
                      className={cn(
                        "text-xs",
                        ultimo ? "font-semibold text-ink-primary dark:text-white" : "text-ink-secondary dark:text-white/60"
                      )}
                    >
                      {passo.titulo}
                    </span>
                    <span className="text-[11px] text-ink-muted">{formatDateBR(passo.data)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {!somenteLeitura && (
          <button
            type="button"
            onClick={toggle}
            disabled={processando}
            className={cn(
              "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
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
