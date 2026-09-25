"use client";

import { X } from "lucide-react";
import { CIDADES_FILTRO, normalize } from "@/lib/auth/roles";
import { ASSISTENTE_LABEL, QUADRO_LABEL } from "@/lib/types";
import type { Assistente, QuadroEscalonamento, Tarefa } from "@/lib/types";

export interface FiltrosState {
  cidade: string; // "" = todas; senão a chave de CIDADES_FILTRO
  pessoa: string; // "todos" | "coordenador" | "analista" | "assistentes" | id de assistente
}

export const FILTROS_INICIAIS: FiltrosState = { cidade: "", pessoa: "todos" };

interface Visao {
  pracas: Assistente[];
  quadrosEscalonamento: QuadroEscalonamento[];
  tarefas: Tarefa[];
}

/** Aplica cidade + cargo/pessoa sobre o que o perfil já pode ver (o RBAC é decidido antes, em roles.ts). */
export function aplicarFiltros(visao: Visao, { cidade, pessoa }: FiltrosState): Visao {
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

  const tarefasF = cidade ? tarefas.filter((t) => normalize(t.cidade ?? "").includes(cidade)) : tarefas;
  return { pracas: pracasF, quadrosEscalonamento: escalF, tarefas: tarefasF };
}

export function FiltrosTarefas({
  pracas,
  quadrosEscalonamento,
  valor,
  onChange,
}: {
  pracas: Assistente[];
  quadrosEscalonamento: QuadroEscalonamento[];
  valor: FiltrosState;
  onChange: (novo: FiltrosState) => void;
}) {
  const cidades = CIDADES_FILTRO.filter((c) => pracas.includes(c.praca));
  const ativo = valor.cidade !== "" || valor.pessoa !== "todos";

  return (
    <div className="surface-card mb-6 flex flex-wrap items-end gap-4 p-4">
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

      {ativo && (
        <button
          type="button"
          onClick={() => onChange(FILTROS_INICIAIS)}
          className="btn-secondary"
        >
          <X size={16} />
          Limpar filtros
        </button>
      )}
    </div>
  );
}
