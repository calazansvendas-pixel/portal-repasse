"use client";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CIDADES_FILTRO, normalize } from "@/lib/auth/roles";
import { diasAtrasISO, hojeISO, inicioDaSemanaISO, lembreteVencido } from "@/lib/utils/dates";
import { somenteDigitos } from "@/lib/utils/cpf";
import { ASSISTENTE_LABEL, QUADRO_LABEL } from "@/lib/types";
import type { Assistente, EtapaHistorico, NotaResolucao, QuadroEscalonamento, Tarefa } from "@/lib/types";

/** Concluída "de verdade" para fins de filtro — um lembrete vencido reabre a tarefa mesmo que o
 * status ainda diga pending_validation/validated_done (ver TaskCard.tsx, mesmo critério). */
function efetivamenteConcluida(t: Tarefa): boolean {
  const concluida = t.status === "pending_validation" || t.status === "validated_done";
  return concluida && !lembreteVencido(t.lembreteAtivo, t.lembreteData);
}

export interface FiltrosState {
  cidade: string; // "" = todas; senão a chave de CIDADES_FILTRO
  pessoa: string; // "todos" | "coordenador" | "analista" | "assistentes" | id de assistente
  status: FiltroStatus;
  busca: string; // nome do cliente OU CPF/CNPJ (com ou sem pontuação) — ver tarefaBateNaBusca
  dataInicio: string; // yyyy-MM-dd; "" = sem piso (ver tarefaTeveAtividadeNoPeriodo)
  dataFim: string; // yyyy-MM-dd; "" = sem teto
}

/** `data` pode vir como "yyyy-MM-dd" (EtapaHistorico) ou ISO datetime (NotaResolucao/resolvidoEm) —
 * os 10 primeiros caracteres bastam nos dois casos, e a comparação lexicográfica desse prefixo
 * bate com a cronológica (mesmo truque de lembreteVencido em dates.ts). */
function dataNoIntervalo(dataISO: string | null | undefined, inicio: string, fim: string): boolean {
  if (!dataISO) return false;
  const data = dataISO.slice(0, 10);
  if (inicio && data < inicio) return false;
  if (fim && data > fim) return false;
  return true;
}

/** Só conta como "movimentação de etapa" uma TROCA real (etapa diferente da entrada anterior) —
 * o log diário repete a mesma etapa importação após importação enquanto a pasta não avança, e
 * isso não é uma atividade nova. `historico` já vem ordenado cronologicamente (ver
 * acumularHistorico em auditEngine.ts). */
function teveMovimentacaoDeEtapa(historico: EtapaHistorico[], inicio: string, fim: string): boolean {
  for (let i = 1; i < historico.length; i++) {
    if (historico[i].etapa === historico[i - 1].etapa) continue;
    if (dataNoIntervalo(historico[i].data, inicio, fim)) return true;
  }
  return false;
}

function teveNotaNoIntervalo(notas: NotaResolucao[], inicio: string, fim: string): boolean {
  return notas.some((n) => dataNoIntervalo(n.data, inicio, fim));
}

/** A pasta teve alguma AÇÃO real registrada dentro do período: uma anotação de "O que foi feito",
 * uma troca de etapa, ou a conclusão da tarefa — nunca só `atualizadoEm` (esse campo muda a cada
 * importação, mesmo sem nenhuma ação humana, então usá-lo aqui inflaria o resultado). */
function tarefaTeveAtividadeNoPeriodo(t: Tarefa, inicio: string, fim: string): boolean {
  if (dataNoIntervalo(t.resolvidoEm, inicio, fim)) return true;
  if (teveNotaNoIntervalo(t.historicoNotas ?? [], inicio, fim)) return true;
  if (teveMovimentacaoDeEtapa(t.historicoEtapas ?? [], inicio, fim)) return true;
  return false;
}

/** Nome e CPF podem bater: nome por inclusão normalizada, CPF só comparando dígitos (o usuário
 * pode digitar com ou sem pontuação). Olha tanto o cliente principal quanto os relacionados de
 * uma tarefa agregada (Motor de Regras), já que o card lista os dois. */
function tarefaBateNaBusca(t: Tarefa, termoNome: string, termoCpf: string): boolean {
  if (!termoNome && !termoCpf) return true;
  const nomes = [t.clienteNome, ...(t.nomesRelacionados ?? [])].filter((n): n is string => !!n);
  if (termoNome && nomes.some((n) => normalize(n).includes(termoNome))) return true;
  if (!termoCpf) return false;
  const cpfs = [t.cpfCnpj, ...(t.cpfsRelacionados ?? [])].filter((c): c is string => !!c);
  return cpfs.some((c) => somenteDigitos(c).includes(termoCpf));
}

/** "a_fazer" oculta o que já tem o check verde (pending_validation/validated_done); "feitas"
 * mostra só isso — inclui tanto o que aguarda confirmação da próxima planilha quanto o que ela
 * já confirmou e arquivou, para o histórico de trabalho das assistentes nunca desaparecer. */
export type FiltroStatus = "todas" | "a_fazer" | "feitas";

const OPCOES_STATUS: { valor: FiltroStatus; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "a_fazer", rotulo: "A fazer" },
  { valor: "feitas", rotulo: "Realizadas" },
];

/** Campo de busca por nome do cliente ou CPF/CNPJ (com ou sem pontuação) — visível para todos os
 * perfis, inclusive Assistente (que não tem a barra de filtros completa). */
export function BuscaTarefas({ valor, onChange }: { valor: string; onChange: (novo: string) => void }) {
  return (
    <label className="relative flex w-full flex-col gap-1.5 sm:w-72">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Buscar</span>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          type="text"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nome do cliente ou CPF/CNPJ"
          className="input-field pl-9"
        />
      </div>
    </label>
  );
}

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

export const FILTROS_INICIAIS: FiltrosState = {
  cidade: "",
  pessoa: "todos",
  status: "todas",
  busca: "",
  dataInicio: "",
  dataFim: "",
};

interface Visao {
  pracas: Assistente[];
  quadrosEscalonamento: QuadroEscalonamento[];
  tarefas: Tarefa[];
}

/** Aplica cidade + cargo/pessoa sobre o que o perfil já pode ver (o RBAC é decidido antes, em roles.ts). */
export function aplicarFiltros(visao: Visao, { cidade, pessoa, status, busca, dataInicio, dataFim }: FiltrosState): Visao {
  const { pracas, quadrosEscalonamento, tarefas } = visao;
  const termoNome = normalize(busca.trim());
  const termoCpf = somenteDigitos(busca);
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
  const porStatus =
    status === "a_fazer"
      ? porCidade.filter((t) => !efetivamenteConcluida(t))
      : status === "feitas"
        ? porCidade.filter(efetivamenteConcluida)
        : porCidade;
  const porPeriodo =
    dataInicio || dataFim ? porStatus.filter((t) => tarefaTeveAtividadeNoPeriodo(t, dataInicio, dataFim)) : porStatus;
  const tarefasF = busca.trim() ? porPeriodo.filter((t) => tarefaBateNaBusca(t, termoNome, termoCpf)) : porPeriodo;
  return { pracas: pracasF, quadrosEscalonamento: escalF, tarefas: tarefasF };
}

/** Atalhos rápidos de período — cada um já calcula "De"/"Até" prontos; digitar direto nos campos
 * de data é o caminho "Personalizado" (nenhum atalho precisa ficar marcado para isso). */
function FiltroPeriodoAtividade({
  dataInicio,
  dataFim,
  onChange,
}: {
  dataInicio: string;
  dataFim: string;
  onChange: (dataInicio: string, dataFim: string) => void;
}) {
  const hoje = hojeISO();
  const atalhos: { rotulo: string; inicio: string; fim: string }[] = [
    { rotulo: "Esta semana", inicio: inicioDaSemanaISO(), fim: hoje },
    { rotulo: "Últimos 7 dias", inicio: diasAtrasISO(6), fim: hoje },
  ];

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Atividade no período</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label="De"
          value={dataInicio}
          max={dataFim || undefined}
          onChange={(e) => onChange(e.target.value, dataFim)}
          className="input-field w-auto"
        />
        <span className="text-xs text-ink-muted">até</span>
        <input
          type="date"
          aria-label="Até"
          value={dataFim}
          min={dataInicio || undefined}
          onChange={(e) => onChange(dataInicio, e.target.value)}
          className="input-field w-auto"
        />
        {atalhos.map((a) => (
          <button
            key={a.rotulo}
            type="button"
            onClick={() => onChange(a.inicio, a.fim)}
            className={cn(
              "h-9 rounded-md px-3 text-xs font-medium transition-colors",
              dataInicio === a.inicio && dataFim === a.fim
                ? "bg-brand-primary text-white"
                : "border border-border text-ink-secondary hover:bg-surface-soft dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
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
  const ativo =
    valor.cidade !== "" ||
    valor.pessoa !== "todos" ||
    valor.status !== "todas" ||
    valor.busca !== "" ||
    valor.dataInicio !== "" ||
    valor.dataFim !== "";

  return (
    <div className="surface-card mb-4 flex flex-wrap items-end gap-3 p-3 sm:mb-6 sm:gap-4 sm:p-4">
      <BuscaTarefas valor={valor.busca} onChange={(busca) => onChange({ ...valor, busca })} />

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

      <FiltroPeriodoAtividade
        dataInicio={valor.dataInicio}
        dataFim={valor.dataFim}
        onChange={(dataInicio, dataFim) => onChange({ ...valor, dataInicio, dataFim })}
      />

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
