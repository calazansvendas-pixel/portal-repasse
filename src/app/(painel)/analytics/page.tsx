"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Hourglass, Rocket, Undo2, UserX } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { podeVerPainelAnalitico } from "@/lib/auth/roles";
import type { RankingParceiro } from "@/lib/services/analiseParceiros";
import { usePainelAnalitico } from "@/lib/hooks/usePainelAnalitico";
import { Topbar } from "@/components/layout/Topbar";
import { StatTile } from "@/components/dashboard/StatTile";
import { GargalosChart } from "@/components/dashboard/GargalosChart";
import { EvolucaoDiariaChart } from "@/components/dashboard/EvolucaoDiariaChart";
import { RankingParceiros } from "@/components/dashboard/RankingParceiros";
import { MapaTreinamento } from "@/components/dashboard/MapaTreinamento";

const JANELAS = [7, 14, 21, 30, 60, 90];

export default function AnalyticsPage() {
  const { profile } = useAuth();
  const [dias, setDias] = useState(21);
  const podeVer = !!profile && podeVerPainelAnalitico(profile.role);
  const { dados, loading, erro } = usePainelAnalitico(dias, podeVer);

  const resumo = useMemo(() => {
    if (!dados) return null;
    const ranking = dados.ranking;
    const soma = (f: (r: RankingParceiro) => number) => ranking.reduce((s, r) => s + f(r), 0);
    const total = soma((r) => r.totalPendencias);
    const falhas = soma((r) => r.falhasAuditoria);
    const maior = [...dados.evolucao.gargalos].sort((a, b) => b.diasMedios - a.diasMedios)[0];
    return {
      total,
      resolvidas: soma((r) => r.resolvidas),
      falhas,
      taxaFalha: total ? Math.round((falhas / total) * 1000) / 10 : 0,
      etapaGargalo: maior ? `Etapa ${maior.etapa}` : "—",
    };
  }, [dados]);

  if (!profile) return null;
  if (!podeVer) {
    return (
      <div>
        <Topbar titulo="Analytics" />
        <p className="text-sm text-ink-muted">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Topbar titulo="Analytics" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-secondary dark:text-white/60">Indicadores da esteira nos últimos dias importados.</p>
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Período
          <select className="input-field w-auto normal-case" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            {JANELAS.map((d) => (
              <option key={d} value={d}>
                Últimos {d} dias
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{erro}</p>
        </div>
      )}

      {dados && (dados.parcial.snapshots || dados.parcial.tarefas) && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">Dados parciais.</span>{" "}
            {[
              dados.parcial.snapshots && `o limite de ${dados.parcial.snapshots.toLocaleString("pt-BR")} snapshots foi atingido`,
              dados.parcial.tarefas && `o limite de ${dados.parcial.tarefas.toLocaleString("pt-BR")} tarefas foi atingido`,
            ]
              .filter(Boolean)
              .join(" e ")}
            . Os números abaixo não cobrem todo o período; reduza a janela de dias para uma leitura completa.
          </p>
        </div>
      )}

      {loading && !dados ? (
        <p className="text-sm text-ink-muted">Carregando indicadores…</p>
      ) : (
        dados &&
        resumo && (
          <div className={loading ? "flex flex-col gap-5 opacity-60 transition-opacity" : "flex flex-col gap-5"}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatTile label="Pendências geradas" value={resumo.total} icon={ClipboardList} />
              <StatTile label="Resolvidas" value={resumo.resolvidas} icon={CheckCircle2} tone="success" />
              <StatTile label="Devolvidas (falha)" value={resumo.falhas} icon={Undo2} tone="danger" />
              <StatTile label="Taxa de falha" value={`${resumo.taxaFalha}%`} icon={AlertTriangle} tone="warning" />
              <StatTile label="Maior gargalo" value={resumo.etapaGargalo} icon={Hourglass} tone="warning" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatTile
                label="Vazamento do funil (qualificação ruim)"
                value={`${dados.estrategicas.taxaVazamentoFunilPct}%`}
                icon={UserX}
                tone="danger"
              />
              <StatTile
                label="Eficiência de inclusão (saíram da 0.01)"
                value={`${dados.estrategicas.eficienciaInclusaoPct}%`}
                icon={Rocket}
                tone="success"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <GargalosChart dados={dados.evolucao} />
              <EvolucaoDiariaChart dados={dados.evolucao} />
            </div>

            <RankingParceiros ranking={dados.ranking} />
            <MapaTreinamento cruzamento={dados.mapa} />
          </div>
        )
      )}
    </div>
  );
}
