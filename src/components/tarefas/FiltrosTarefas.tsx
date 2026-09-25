"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CIDADES_FILTRO, normalize } from "@/lib/auth/roles";
import { ASSISTENTE_LABEL, QUADRO_LABEL } from "@/lib/types";
import type { Assistente, QuadroEscalonamento, Tarefa } from "@/lib/types";

export interface FiltrosState {
  cidade: string; // "" = todas; senão a chave de CIDADES_FILTRO
  pessoa: string; // "todos" | "coordenador" | "analista" | "assistentes" | id de assistente
  status: FiltroStatus;
}

/** "a_fazer" oculta o que já tem o check verde (pending_validation); "feitas" mostra só isso. */
export type FiltroStatus = "todas" | "a_fazer" | "feitas";

const OPCOES_STATUS: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "a_fazer", rotulo: "A fazer" },
  { valor: "feitas", rotulo: "Feitas" },
];

/** Grupo de botões Todas / A fazer / Feitas. Visível para todos os perfis. */
export function FiltroStatusTarefas({
  valor,
  onChange,
}: {
  valor: FiltroStatus;
  onChange: (novo: FiltroStatus) => void;
}) {
  return (
    <div role="group" aria-label="Filtrar por situação" className="inline-flex rounded-md border border-border p-0.5 dark:border-white/15">
      {OPCOES_STATUS.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            "h-9 min-w-[72px] rounded px-3 text-sm font-medium transition-colors",
            valor === o.valor
              ? "bg-brand-primary text-white"
              : "text-ink-secondary hover:bg-surface-soft dark:text-white/70 dark:hover:bg-white/10"
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export const FILTROS_INICIAIS: FiltrosState = { cidade: "", pessoa: "todos", status: "todas" };

interface Visao {
  pracas: Assistente[];
  quadrosEscalonamento: QuadroEscalonamento[];
  tarefas: Tarefa[];
}

/** Aplica cidade + cargo/pessoa sobre o que o perfil já pode ver (o RBAC é decidido antes, em roles.ts). */
export function aplicarFiltros(visao: Visao, { cidade, pessoa, status }: FiltrosState): Visao {
  const { pracas, quadrosEscalonamento, tarefas } = visao;
  const pracaDaCidade = cidade ? CIDADES_FILTRO.find((c) => c.chave === cidade)?.praca ?? null : null;

  let pracasF = pracas;
  let escalF = quadrosEscalonamento;

  if (pessoa === "todos") {
    // Com cidade escolhida, mostra apenas a coluna da assistente responsável por ela.
    if (cidade) {
      pracasF = pracaDaCidade && pracas.includes(pracaDaCidade) ? [pracaDaCidade] : [];
      escalF = [];
    }
  } else if (pessoa === "coordenador" || pessoa === "analista") {
    pracasF = [];
    escalF = quadrosEscalonamento.filter((q) => q === pessoa);
  } else if (pessoa === "assistentes") {
    escalF = [];
  } else {
    pracasF = pracas.filter((p) => p === pessoa);
    escalF = [];
  }

  if (cidade && pessoa !== "todos") {
    pracasF = pracasF.filter((p) => p === pracaDaCidade);
  }

  const porCidade = cidade ? tarefas.filter((t) => t.origem === "manual" || normalize(t.cidade ?? "").includes(cidade)) : tarefas;
  const tarefasF =
    status === "a_fazer"
      ? porCidade.filter((t) => t.status !== "pending_validation")
      : status === "feitas"
        ? porCidade.filter((t) => t.status === "pending_validation")
        : porCidade;
  return { pracas: pracasF, quadrosEscalonamento: escalF, tarefas: tarefasF };
}

export function FiltrosTarefas({
  pracas,
  quadrosEscalonamento,
  valor,
  onChange,
  acao,
}: {
  pracas: Assistente[];
  quadrosEscalonamento: QuadroEscalonamento[];
  valor: FiltrosState;
  onChange: (novo: FiltrosState) => void;
  /** Ação extra ao lado dos filtros (ex: botão "Nova Tarefa"). */
  acao?: ReactNode;
}) {
  const cidades = CIDADES_FILTRO.filter((c) => pracas.includes(c.praca));
  const ativo = valor.cidade !== "" || valor.pessoa !== "todos" || valor.status !== "todas";

  return (
    <div className="surface-card mb-4 flex flex-wrap items-end gap-3 p-3 sm:mb-6 sm:gap-4 sm:p-4">
      <label className="flex w-full flex-col gap-1.5 sm:w-56">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cidade</span>
        <select
          className="input-field"
          value={valor.cidade}
          onChange={(e) => onChange({ ...valor, cidade: e.target.value })}
        >
          <option value="">Todas as cidades</option>
          {cidades.map((c) => (
            <option key={c.chave} value={c.chave}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-full flex-col gap-1.5 sm:w-64">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cargo / Pessoa</span>
        <select
          className="input-field"
          value={valor.pessoa}
          onChange={(e) => onChange({ ...valor, pessoa: e.target.value })}
        >
          <option value="todos">Mostrar todos</option>
          {quadrosEscalonamento.includes("coordenador") && (
            <option value="coordenador">{QUADRO_LABEL.coordenador}</option>
          )}
          {quadrosEscalonamento.includes("analista") && (
            <option value="analista">{QUADRO_LABEL.analista}</option>
          )}
          {pracas.length > 1 && <option value="assistentes">Assistentes (visão conjunta)</option>}
          {pracas.length > 1 &&
            pracas.map((p) => (
              <option key={p} value={p}>
                {ASSISTENTE_LABEL[p]}
              </option>
            ))}
        </select>
      </label>

      <div className="flex w-full flex-col gap-1.5 sm:w-auto">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Situação</span>
        <FiltroStatusTarefas valor={valor.status} onChange={(status) => onChange({ ...valor, status })} />
      </div>

      {ativo && (
        <button
          type="button"
          onClick={() => onChange(FILTROS_INICIAIS)}
          className="btn-secondary w-full sm:w-auto"
        >
          <X size={16} />
          Limpar filtros
        </button>
      )}
      {acao}
    </div>
  );
}
