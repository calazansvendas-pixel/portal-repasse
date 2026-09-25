"use client";

import { useState } from "react";
import { AlertTriangle, Check, Layers } from "lucide-react";
import type { Tarefa } from "@/lib/types";
import { SLA_BADGE_CLASSES, SLA_LABEL } from "@/lib/utils/sla";
import { marcarTarefaResolvida, reverterTarefa } from "@/lib/services/tarefasService";
import { useAuth } from "@/lib/auth/AuthContext";
import { meuQuadroInterativo } from "@/lib/auth/roles";
import { formatDateBR } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { DetalhesTarefaModal, NotaConclusaoModal } from "./ModaisTarefa";
import { ObservacaoChecklist, TrajetoPasta } from "./partesCard";

const PRACAS_ASSISTENTES: Tarefa["praca"][] = ["laiza", "eliane", "catarina"];

export function TaskCard({ tarefa, somenteLeitura = false }: { tarefa: Tarefa; somenteLeitura?: boolean }) {
  const { firebaseUser, profile } = useAuth();
  const [modal, setModal] = useState<"nota" | "detalhes" | null>(null);

  const aguardandoValidacao = tarefa.status === "pending_validation";
  const falhaAuditoria = tarefa.status === "audit_failed";
  const isAgregado = tarefa.origem === "agregado";
  const isManual = tarefa.origem === "manual";

  // Reverter: o dono do quadro (clique por engano) ou a gestão auditando cards das assistentes.
  const podeReverter =
    !!profile &&
    (meuQuadroInterativo(profile).includes(tarefa.praca) ||
      (["gerencia", "coordenador", "analista"].includes(profile.role) &&
        PRACAS_ASSISTENTES.includes(tarefa.praca)));

  async function confirmarConclusao(nota: string) {
    if (!firebaseUser) return;
    await marcarTarefaResolvida(tarefa, firebaseUser.uid, nota);
    setModal(null);
  }

  async function reverter() {
    await reverterTarefa(tarefa.id);
    setModal(null);
  }

  if (aguardandoValidacao) {
    const nome = isManual
      ? tarefa.descricao
      : tarefa.clienteNome || tarefa.imobiliaria || tarefa.tipoPendencia;
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setModal("detalhes")}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setModal("detalhes")}
          className="surface-card flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-shadow hover:shadow-md"
        >
          <p className="truncate text-sm font-semibold text-ink-primary dark:text-white">{nome}</p>
          <span className="shrink-0 rounded-full bg-status-success/15 p-1.5 text-status-success">
            <Check size={20} strokeWidth={3} />
          </span>
        </div>
        {modal === "detalhes" && (
          <DetalhesTarefaModal
            tarefa={tarefa}
            podeReverter={podeReverter}
            onReverter={reverter}
            onFechar={() => setModal(null)}
          />
        )}
      </>
    );
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

      {/* Cabeçalho: cliente + imobiliária (tarefa avulsa: solicitação interna + quem delegou) */}
      {isManual && (
        <div>
          <p className="text-sm font-semibold leading-snug text-ink-primary dark:text-white">Solicitação Interna</p>
          <p className="text-xs text-ink-muted">Enviado por: {tarefa.criadaPorNome || "—"}</p>
        </div>
      )}
      {!isAgregado && !isManual && (
        <div>
          <p className="text-sm font-semibold leading-snug text-ink-primary dark:text-white">
            {tarefa.clienteNome || "Cliente não identificado"}
          </p>
          <p className="text-xs text-ink-muted">{tarefa.imobiliaria || "Imobiliária não informada"}</p>
        </div>
      )}

      {/* Corpo 1: ação de consultoria/ajuda */}
      <p className="whitespace-pre-line text-sm font-medium leading-snug text-ink-primary dark:text-white">
        {tarefa.descricao}
      </p>

      {/* Corpo 2: o problema, em checklist, para apoiar a ligação */}
      {tarefa.observacaoOriginal && (
        <div className="rounded-md border border-border bg-surface-secondary/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            O que foi relatado
          </p>
          <ObservacaoChecklist texto={tarefa.observacaoOriginal} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {!isManual && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SLA_BADGE_CLASSES[tarefa.slaStatus])}>
            {SLA_LABEL[tarefa.slaStatus]}
          </span>
        )}
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
        ) : isManual ? (
          <span className="text-xs text-ink-muted">Criada em {formatDateBR(tarefa.criadoEm)}</span>
        ) : (
          <TrajetoPasta tarefa={tarefa} />
        )}

        {!somenteLeitura && (
          <button
            type="button"
            onClick={() => setModal("nota")}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-status-success/40 bg-status-success/10 px-2.5 py-1.5 text-xs font-semibold text-status-success transition-colors hover:bg-status-success/15"
          >
            <Check size={14} />
            Marcar como resolvida
          </button>
        )}
      </div>

      {modal === "nota" && (
        <NotaConclusaoModal onConfirmar={confirmarConclusao} onCancelar={() => setModal(null)} />
      )}
    </div>
  );
}
