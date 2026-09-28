"use client";

import { useMemo, useState } from "react";
import type { Assistente, Quadro, QuadroEscalonamento, Role, Tarefa } from "@/lib/types";
import { ASSISTENTE_LABEL, QUADRO_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { slaExibido } from "@/lib/utils/sla";
import { TaskCard } from "./TaskCard";

interface Coluna {
  chave: Quadro;
  titulo: string;
  tarefas: Tarefa[];
  escalonamento: boolean;
}

export function TaskBoard({
  role,
  pracas,
  tarefas,
  loading,
  meusQuadros = [],
  quadrosEscalonamento = [],
}: {
  role: Role;
  pracas: Assistente[];
  tarefas: Tarefa[];
  loading: boolean;
  /** Quadros em que o usuário atual pode marcar/desmarcar o checkbox. */
  meusQuadros?: Quadro[];
  /** Quadros de Coordenador/Analista visíveis (tarefas nativas + escalonadas). */
  quadrosEscalonamento?: QuadroEscalonamento[];
}) {
  // Ordem hierárquica de cima para baixo:
  //  1) quadro do próprio usuário (Coordenador ou Analista; a Gerência não tem
  //     quadro próprio, então o do Coordenador ocupa o topo para ela);
  //  2) quadro da Analista, se não for a própria logada (evita duplicar);
  //  3) grid das assistentes.
  const { topo, meio, assistentes } = useMemo(() => {
    const assistentes: Coluna[] = pracas.map((praca) => ({
      chave: praca as Quadro,
      titulo: ASSISTENTE_LABEL[praca],
      tarefas: ordenarPorSla(tarefas.filter((t) => t.praca === praca)),
      escalonamento: false,
    }));

    const escalonadas: Coluna[] = quadrosEscalonamento.map((quadro) => ({
      chave: quadro as Quadro,
      titulo: QUADRO_LABEL[quadro],
      tarefas: ordenarPorSla(
        tarefas.filter((t) => t.praca === quadro || t.escalonadoPara?.includes(quadro))
      ),
      escalonamento: true,
    }));

    const analista = escalonadas.find((c) => c.chave === "analista") ?? null;
    const coordenador = escalonadas.find((c) => c.chave === "coordenador") ?? null;

    return {
      topo: role === "analista" ? analista : coordenador,
      meio: role === "analista" ? null : analista,
      assistentes,
    };
  }, [role, pracas, tarefas, quadrosEscalonamento]);

  // Etapas com tarefa ativa em QUALQUER swimlane, na mesma ordem numérica das colunas — alimenta
  // o filtro do topo do painel.
  const etapasDisponiveis = useMemo(
    () => [...new Set(tarefas.map((t) => codigoEtapa(t.etapa)))].sort(compararCodigosEtapa),
    [tarefas]
  );
  const [etapasSelecionadas, setEtapasSelecionadas] = useState<Set<string>>(new Set());
  // Padrão: clicar numa etapa troca a seleção (só ela fica marcada); clicar de novo limpa.
  // "Selecionar múltiplas" liga o modo cumulativo (marca/desmarca sem afetar as outras).
  const [isMultiSelect, setIsMultiSelect] = useState(false);

  function alternarEtapa(codigo: string) {
    setEtapasSelecionadas((atual) => {
      if (!isMultiSelect) {
        // Single-select: clicar na já marcada limpa; clicar em outra troca a seleção inteira.
        return atual.has(codigo) && atual.size === 1 ? new Set() : new Set([codigo]);
      }
      const novo = new Set(atual);
      if (novo.has(codigo)) novo.delete(codigo);
      else novo.add(codigo);
      return novo;
    });
  }

  function alternarModoMultiSelect(ativo: boolean) {
    setIsMultiSelect(ativo);
    // Trocar de modo com mais de uma etapa marcada não faz sentido em single-select — mantém só a
    // seleção "colapsando" para a mais recente seria arbitrário, então zera para evitar confusão.
    if (!ativo) setEtapasSelecionadas((atual) => (atual.size > 1 ? new Set() : atual));
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Carregando tarefas…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {etapasDisponiveis.length > 1 && (
        <FiltroEtapas
          etapas={etapasDisponiveis}
          selecionadas={etapasSelecionadas}
          onAlternar={alternarEtapa}
          onLimpar={() => setEtapasSelecionadas(new Set())}
          isMultiSelect={isMultiSelect}
          onAlternarMultiSelect={alternarModoMultiSelect}
        />
      )}

      <div className="flex flex-col gap-8">
        {topo && (
          <ColunaTarefas coluna={topo} interativo={meusQuadros.includes(topo.chave)} etapasSelecionadas={etapasSelecionadas} />
        )}
        {meio && (
          <ColunaTarefas coluna={meio} interativo={meusQuadros.includes(meio.chave)} etapasSelecionadas={etapasSelecionadas} />
        )}

        {/* Cada assistente ocupa uma swimlane própria, de largura total, empilhadas — mesmo padrão
            visual do Coordenador/Analista acima. Sem agrupamento lado a lado. */}
        {assistentes.map((coluna) => (
          <ColunaTarefas
            key={coluna.chave}
            coluna={coluna}
            interativo={meusQuadros.includes(coluna.chave)}
            etapasSelecionadas={etapasSelecionadas}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Tags de filtro de etapa. Padrão: seleção única (clicar troca; clicar na já marcada limpa).
 * Com "Selecionar múltiplas" ligado, vira multi-seleção cumulativa. Nenhuma marcada = mostra tudo.
 */
function FiltroEtapas({
  etapas,
  selecionadas,
  onAlternar,
  onLimpar,
  isMultiSelect,
  onAlternarMultiSelect,
}: {
  etapas: string[];
  selecionadas: Set<string>;
  onAlternar: (codigo: string) => void;
  onLimpar: () => void;
  isMultiSelect: boolean;
  onAlternarMultiSelect: (ativo: boolean) => void;
}) {
  return (
    <div className="surface-card flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Filtrar etapas</span>
        {etapas.map((codigo) => {
          const ativo = selecionadas.has(codigo);
          return (
            <button
              key={codigo}
              type="button"
              onClick={() => onAlternar(codigo)}
              aria-pressed={ativo}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                ativo
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-border text-ink-secondary hover:bg-surface-soft dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
              )}
            >
              {codigo}
            </button>
          );
        })}
        {selecionadas.size > 0 && (
          <button
            type="button"
            onClick={onLimpar}
            className="ml-1 text-xs font-medium text-ink-muted underline-offset-2 hover:underline"
          >
            Limpar filtro
          </button>
        )}
      </div>
      <label className="flex w-fit items-center gap-1.5 text-[11px] text-ink-muted">
        <input
          type="checkbox"
          checked={isMultiSelect}
          onChange={(e) => onAlternarMultiSelect(e.target.checked)}
          className="h-3.5 w-3.5 accent-brand-primary"
        />
        Selecionar múltiplas
      </label>
    </div>
  );
}

function ColunaTarefas({
  coluna,
  interativo,
  etapasSelecionadas,
}: {
  coluna: Coluna;
  interativo: boolean;
  /** Vazio = mostra todas as etapas (comportamento padrão); com itens, só essas colunas aparecem. */
  etapasSelecionadas: Set<string>;
}) {
  const { titulo, tarefas: tarefasDaColuna, escalonamento } = coluna;
  const grupos = agruparPorEtapa(tarefasDaColuna).filter(
    (g) => etapasSelecionadas.size === 0 || etapasSelecionadas.has(g.etapa)
  );
  const totalVisivel = grupos.reduce((soma, g) => soma + g.tarefas.length, 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Cabeçalho da swimlane: fundo sutil + borda inferior de ponta a ponta (largura total do
          painel) para separar visualmente onde termina o bloco de uma pessoa e começa o de outra. */}
      <div
        className={cn(
          "flex items-center justify-between rounded-t-md border-b-2 bg-surface-soft px-4 py-2.5 dark:bg-white/5",
          escalonamento ? "border-status-danger" : "border-brand-primary"
        )}
      >
        <h2
          className={cn(
            "text-base font-extrabold uppercase tracking-wide",
            escalonamento ? "text-status-danger" : "text-ink-primary dark:text-white"
          )}
        >
          {titulo}
        </h2>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            escalonamento
              ? "bg-status-danger/10 text-status-danger"
              : "bg-surface-green text-brand-primaryDark dark:bg-white/10 dark:text-white/70"
          )}
        >
          {totalVisivel}
        </span>
      </div>

      {tarefasDaColuna.length === 0 ? (
        <div className="surface-card p-4 text-center text-xs text-ink-muted">
          Nenhuma pendência no momento.
        </div>
      ) : grupos.length === 0 ? (
        <div className="surface-card p-4 text-center text-xs text-ink-muted">
          Nenhuma tarefa nas etapas selecionadas.
        </div>
      ) : (
        // flex-row + overflow-x-auto: uma coluna de Kanban por etapa, lado a lado, com scroll
        // horizontal. Puramente organizacional — a etapa vem do motor, sem drag-and-drop.
        <div className="flex flex-row gap-4 overflow-x-auto pb-2">
          {grupos.map((grupo) => (
            <div key={grupo.etapa} className="flex w-72 shrink-0 flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Etapa {grupo.etapa}
                </span>
                <span className="text-[11px] text-ink-muted">{grupo.tarefas.length}</span>
              </div>
              <div className="flex flex-col gap-3">
                {grupo.tarefas.map((t) => (
                  <TaskCard key={t.id} tarefa={t} somenteLeitura={!interativo} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface GrupoEtapa {
  etapa: string; // código exibido no cabeçalho, ex.: "0.01", "1.17", "Geral"
  tarefas: Tarefa[];
}

/** Código da etapa: a planilha traz "1.17 - Documentação incompleta", a coluna mostra só "1.17". */
function codigoEtapa(etapa: string | null | undefined): string {
  const valor = (etapa ?? "").trim();
  if (!valor) return "Geral"; // tarefas agregadas (gargalo, ociosidade, SLA interno) não têm etapa própria
  return valor.split(" - ")[0]?.trim() || "Geral";
}

/** Numérico crescente primeiro ("Geral" e afins vão para o fim); alfabético como desempate. */
function compararCodigosEtapa(a: string, b: string): number {
  const na = Number.parseFloat(a);
  const nb = Number.parseFloat(b);
  if (Number.isNaN(na) && Number.isNaN(nb)) return a.localeCompare(b);
  if (Number.isNaN(na)) return 1;
  if (Number.isNaN(nb)) return -1;
  return na - nb;
}

/** Agrupa preservando a ordem por SLA já aplicada dentro de cada etapa; só as etapas com tarefa aparecem. */
function agruparPorEtapa(tarefas: Tarefa[]): GrupoEtapa[] {
  const grupos = new Map<string, Tarefa[]>();
  for (const t of tarefas) {
    const codigo = codigoEtapa(t.etapa);
    grupos.set(codigo, [...(grupos.get(codigo) ?? []), t]);
  }
  return [...grupos.entries()]
    .map(([etapa, tarefas]) => ({ etapa, tarefas }))
    .sort((a, b) => compararCodigosEtapa(a.etapa, b.etapa));
}

function ordenarPorSla(lista: Tarefa[]): Tarefa[] {
  // Tarefas avulsas (delegadas por alguém) vêm primeiro; o resto por urgência de SLA.
  const peso = (t: Tarefa) => (t.origem === "manual" ? -1 : ordemSla(slaExibido(t)));
  return [...lista].sort((a, b) => peso(a) - peso(b));
}

function ordemSla(status: Tarefa["slaStatus"]): number {
  const ordem: Record<Tarefa["slaStatus"], number> = {
    estourado: 0,
    urgente: 1,
    atencao: 2,
    no_prazo: 3,
  };
  return ordem[status];
}
