"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, FolderKanban, ShieldAlert, TimerReset } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  pracasVisiveis,
  quadrosEscalonamentoVisiveis,
  podeVerPainelGerencial,
  podeVerPainelAnalitico,
  podeVerRelatoriosGerais,
} from "@/lib/auth/roles";
import { useRegistros } from "@/lib/hooks/useRegistros";
import { useTodasTarefas } from "@/lib/hooks/useTodasTarefas";
import { useTarefasPorPracas } from "@/lib/hooks/useTarefas";
import { useEvolucaoEtapas } from "@/lib/hooks/useEvolucaoEtapas";
import { calcularRankingParceiros, calcularMapaTreinamento } from "@/lib/services/analiseParceiros";
import { Topbar } from "@/components/layout/Topbar";
import { StatTile } from "@/components/dashboard/StatTile";
import { EvolucaoDiariaChart } from "@/components/dashboard/EvolucaoDiariaChart";
import { GargalosChart } from "@/components/dashboard/GargalosChart";
import { RankingParceiros } from "@/components/dashboard/RankingParceiros";
import { MapaTreinamento } from "@/components/dashboard/MapaTreinamento";
import { TaskBoard } from "@/components/tarefas/TaskBoard";

export default function DashboardPage() {
  const { profile } = useAuth();
  const pracas = profile ? pracasVisiveis(profile) : [];
  const quadrosEscalonamento = profile ? quadrosEscalonamentoVisiveis(profile) : [];
  const { registros } = useRegistros();
  const { tarefas: todasTarefas } = useTodasTarefas();
  const { tarefas: tarefasDoQuadro, loading: loadingQuadro, erro: erroQuadro } = useTarefasPorPracas(pracas);
  const { dados: evolucao, loading: loadingEvolucao } = useEvolucaoEtapas();

  const ranking = useMemo(() => calcularRankingParceiros(todasTarefas), [todasTarefas]);
  const mapaTreinamento = useMemo(() => calcularMapaTreinamento(todasTarefas), [todasTarefas]);

  if (!profile) return null;

  const verGerencial = podeVerPainelGerencial(profile.role);
  const verAnalitico = podeVerPainelAnalitico(profile.role);
  const verRelatorios = podeVerRelatoriosGerais(profile.role);

  const estourados = registros.filter((r) => r.slaStatus === "estourado").length;
  const pendentesAtivas = tarefasDoQuadro.filter((t) => t.status !== "pending_validation").length;
  const aguardandoValidacao = tarefasDoQuadro.filter((t) => t.status === "pending_validation").length;
  const falhasAuditoria = todasTarefas.filter((t) => t.status === "audit_failed").length;

  return (
    <div className="flex flex-col gap-6">
      <Topbar titulo={`Olá, ${profile.nome.split(" ")[0]}`} />

      {erroQuadro && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar as tarefas.</p>
            <p className="mt-1 text-xs">{erroQuadro}</p>
          </div>
        </div>
      )}

      {profile.role === "assistente" ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Pendentes" value={pendentesAtivas} icon={ClipboardList} tone="warning" />
            <StatTile label="Aguardando validação" value={aguardandoValidacao} icon={TimerReset} tone="neutral" />
            <StatTile
              label="Falha de auditoria"
              value={tarefasDoQuadro.filter((t) => t.status === "audit_failed").length}
              icon={AlertTriangle}
              tone="danger"
            />
            <StatTile
              label="No prazo"
              value={tarefasDoQuadro.filter((t) => t.slaStatus === "no_prazo").length}
              icon={CheckCircle2}
              tone="success"
            />
          </div>
          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-secondary dark:text-white/60">
              Seu quadro de tarefas
            </h2>
            <TaskBoard pracas={pracas} tarefas={tarefasDoQuadro} loading={loadingQuadro} />
          </div>
        </>
      ) : (
        <>
          {verGerencial && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Pastas na esteira" value={registros.length} icon={FolderKanban} />
              <StatTile label="Tarefas ativas" value={pendentesAtivas} icon={ClipboardList} tone="warning" />
              <StatTile label="SLA estourado" value={estourados} icon={AlertTriangle} tone="danger" />
              <StatTile label="Falhas de auditoria" value={falhasAuditoria} icon={ShieldAlert} tone="danger" />
            </div>
          )}

          {verAnalitico && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {loadingEvolucao ? (
                <p className="text-sm text-ink-muted">Calculando analytics…</p>
              ) : (
                evolucao && (
                  <>
                    <EvolucaoDiariaChart dados={evolucao} />
                    <GargalosChart dados={evolucao} />
                  </>
                )
              )}
            </div>
          )}

          {verRelatorios && (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <RankingParceiros ranking={ranking} />
              <MapaTreinamento cruzamento={mapaTreinamento} />
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-secondary dark:text-white/60">
              {profile.role === "gerencia" ? "Todos os quadros de tarefas" : "Tarefas da operação"}
            </h2>
            <TaskBoard
              pracas={pracas}
              tarefas={tarefasDoQuadro}
              loading={loadingQuadro}
              somenteLeitura
              quadrosEscalonamento={quadrosEscalonamento}
            />
          </div>
        </>
      )}
    </div>
  );
}
