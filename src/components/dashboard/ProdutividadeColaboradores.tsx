"use client";

import { useMemo, useState } from "react";
import { useDetalheColaborador } from "@/lib/hooks/useDetalheColaborador";
import type { ProdutividadeColaborador } from "@/lib/services/produtividadeColaboradores";

type FiltroPapel = "todos" | "assistente" | "coordenador" | "analista";

const OPCOES_FILTRO: { valor: FiltroPapel; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "assistente", label: "Assistentes" },
  { valor: "analista", label: "Analistas" },
  { valor: "coordenador", label: "Coordenadores" },
];

const ROLE_LABEL: Record<string, string> = {
  assistente: "Assistente",
  coordenador: "Coordenador",
  analista: "Analista",
};

function CardDestaque({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <div className="rounded-md bg-surface-green p-3 dark:bg-white/5">
      <p className="text-[11px] font-semibold uppercase text-ink-muted">{titulo}</p>
      <p className="mt-1 break-words text-base font-bold text-ink-primary dark:text-white">{valor}</p>
      <p className="text-xs text-ink-secondary dark:text-white/60">{detalhe}</p>
    </div>
  );
}

function DetalheIndividual({ uid, dias }: { uid: string; dias: number }) {
  const { detalhe, erro, loading } = useDetalheColaborador(uid, dias);

  if (loading) return <p className="text-sm text-ink-muted">Carregando relatório individual…</p>;
  if (erro) return <p className="text-sm text-status-danger">{erro}</p>;
  if (!detalhe) return null;

  const { etapaMaisTrabalhada: top, etapaMaiorTempo: lenta, empreendimentoMaiorVolume: prod } = detalhe;
  const maxVolume = Math.max(1, ...detalhe.etapas.map((e) => e.volume));

  return (
    <div className="flex flex-col gap-4 rounded-md border border-ink-primary/10 p-3 dark:border-white/10">
      <h3 className="text-sm font-bold text-ink-primary dark:text-white">
        Relatório individual — {detalhe.colaboradorNome}{" "}
        <span className="text-xs font-normal text-ink-muted">(últimos {detalhe.dias} dias)</span>
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CardDestaque
          titulo="Etapa mais trabalhada"
          valor={top?.etapa ?? "—"}
          detalhe={top ? `${top.volume} pasta(s) movimentada(s)` : "Sem movimentações no período"}
        />
        <CardDestaque
          titulo="Maior tempo de virada"
          valor={lenta?.etapa ?? "—"}
          detalhe={lenta ? `${lenta.diasMedios} dias em média · ${lenta.volume} pasta(s)` : "Sem tempo medido no período"}
        />
        <CardDestaque
          titulo="Empreendimento de maior volume"
          valor={prod?.produto ?? "—"}
          detalhe={prod ? `${prod.total} pasta(s) · ${prod.pct}%` : "Sem movimentações no período"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold uppercase text-ink-muted">Etapas tratadas: volume × tempo médio</h4>
          {detalhe.etapas.length === 0 ? (
            <p className="text-sm text-ink-muted">Nenhuma etapa no período.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-primary/10 text-left text-[11px] uppercase text-ink-muted dark:border-white/10">
                    <th className="py-1.5 pr-3">Etapa</th>
                    <th className="py-1.5 pr-3 text-right">Pastas</th>
                    <th className="py-1.5 text-right">Tempo médio</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.etapas.map((e) => (
                    <tr key={e.etapa} className="border-b border-ink-primary/5 dark:border-white/5">
                      <td className="py-1.5 pr-3">
                        <div>{e.etapa}</div>
                        <div className="mt-1 h-1 rounded-full bg-ink-primary/5 dark:bg-white/10">
                          <div
                            className="h-1 rounded-full bg-brand-primary"
                            style={{ width: `${(e.volume / maxVolume) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{e.volume}</td>
                      <td className="py-1.5 text-right tabular-nums">{e.diasMedios === null ? "—" : `${e.diasMedios} d`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold uppercase text-ink-muted">Distribuição por empreendimento</h4>
          {detalhe.empreendimentos.length === 0 ? (
            <p className="text-sm text-ink-muted">Nenhum empreendimento no período.</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {detalhe.empreendimentos.map((p) => (
                <li key={p.produto} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{p.produto}</span>
                    <span className="shrink-0 tabular-nums text-ink-secondary dark:text-white/60">
                      {p.total} · {p.pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-ink-primary/5 dark:bg-white/10">
                    <div className="h-1.5 rounded-full bg-brand-primary" style={{ width: `${p.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-bold uppercase text-ink-muted">
          Pastas ativas sob posse ({detalhe.totalPastasAtivas}
          {detalhe.totalPastasAtivas > detalhe.pastasAtivas.length ? `, exibindo ${detalhe.pastasAtivas.length}` : ""})
        </h4>
        {detalhe.pastasAtivas.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhuma pasta ativa com este colaborador.</p>
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-primary/10 text-left text-[11px] uppercase text-ink-muted dark:border-white/10">
                  <th className="py-1.5 pr-3">Cliente</th>
                  <th className="py-1.5 pr-3">Produto</th>
                  <th className="py-1.5 pr-3">Etapa atual</th>
                  <th className="py-1.5 text-right">Dias na etapa</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.pastasAtivas.map((p) => (
                  <tr key={p.id} className="border-b border-ink-primary/5 dark:border-white/5">
                    <td className="py-1.5 pr-3">{p.cliente}</td>
                    <td className="py-1.5 pr-3">{p.produto}</td>
                    <td className="py-1.5 pr-3">{p.etapa}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.diasNaEtapa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProdutividadeColaboradores({ dados, dias }: { dados: ProdutividadeColaborador[]; dias: number }) {
  const [filtro, setFiltro] = useState<FiltroPapel>("todos");
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const filtrados = useMemo(
    () => (filtro === "todos" ? dados : dados.filter((d) => d.role === filtro)),
    [dados, filtro]
  );
  // Seleção que saiu da lista (ex.: dados recarregados) não dispara chamada nem exibe painel órfão.
  const selecionado = dados.some((d) => d.colaboradorId === selecionadoId) ? selecionadoId : null;

  return (
    <section className="surface-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink-primary dark:text-white">Desempenho e Carga por Colaborador</h2>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Colaborador
          <select
            className="input-field w-auto normal-case"
            value={selecionado ?? ""}
            onChange={(e) => setSelecionadoId(e.target.value || null)}
          >
            <option value="">Visão geral (todos)</option>
            {dados.map((c) => (
              <option key={c.colaboradorId} value={c.colaboradorId}>
                {c.colaboradorNome}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1.5">
          {OPCOES_FILTRO.map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => setFiltro(o.valor)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                filtro === o.valor
                  ? "bg-brand-primary text-white"
                  : "bg-ink-primary/5 text-ink-secondary hover:bg-ink-primary/10 dark:bg-white/5 dark:text-white/70"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {dados.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum colaborador com quadro próprio cadastrado.</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum colaborador encontrado para este filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-primary/10 text-left text-[11px] uppercase text-ink-muted dark:border-white/10">
                <th className="py-2 pr-3">Colaborador</th>
                <th className="py-2 pr-3">Papel</th>
                <th className="py-2 pr-3 text-right">Ativas (carga)</th>
                <th className="py-2 pr-3 text-right">Concluídas no período</th>
                <th className="py-2 pr-3 text-right">Tempo médio</th>
                <th className="py-2 pr-3 text-right">Dentro do prazo</th>
                <th className="py-2">Principais etapas</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr
                  key={c.colaboradorId}
                  tabIndex={0}
                  aria-selected={selecionado === c.colaboradorId}
                  onClick={() => setSelecionadoId(selecionado === c.colaboradorId ? null : c.colaboradorId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelecionadoId(selecionado === c.colaboradorId ? null : c.colaboradorId);
                    }
                  }}
                  className={`cursor-pointer border-b border-ink-primary/5 transition-colors hover:bg-ink-primary/5 dark:border-white/5 dark:hover:bg-white/5 ${
                    selecionado === c.colaboradorId ? "bg-surface-green dark:bg-white/10" : ""
                  }`}
                >
                  <td className="py-2 pr-3 font-medium text-ink-primary dark:text-white">{c.colaboradorNome}</td>
                  <td className="py-2 pr-3 text-ink-secondary dark:text-white/60">{ROLE_LABEL[c.role] ?? c.role}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.ativas}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.concluidasNoPeriodo}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {c.tempoMedioConclusaoDias === null ? "—" : `${c.tempoMedioConclusaoDias} d`}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {c.taxaDentroDoPrazoPct === null ? "—" : `${c.taxaDentroDoPrazoPct}%`}
                  </td>
                  <td className="py-2">
                    {c.porEtapa.length === 0 ? (
                      <span className="text-xs text-ink-muted">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {c.porEtapa.map((e) => (
                          <span
                            key={e.etapa}
                            className="whitespace-nowrap rounded-full bg-surface-green px-2 py-0.5 text-[11px] text-brand-primaryDark dark:bg-white/10 dark:text-white/80"
                          >
                            {e.etapa} · {e.total}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selecionado && <DetalheIndividual uid={selecionado} dias={dias} />}
    </section>
  );
}
