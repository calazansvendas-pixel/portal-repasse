"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Printer } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  pracasVisiveis,
  quadrosEscalonamentoVisiveis,
  quadrosParaBuscar,
  meuQuadroInterativo,
  destinatariosPermitidos,
  podeVerAnalytics,
} from "@/lib/auth/roles";
import { useTarefasPorQuadros } from "@/lib/hooks/useTarefas";
import { usePainelAnalitico } from "@/lib/hooks/usePainelAnalitico";
import { Topbar } from "@/components/layout/Topbar";
import { TaskBoard } from "@/components/tarefas/TaskBoard";
import { NovaTarefaModal } from "@/components/tarefas/NovaTarefaModal";
import { RelatorioExecutivo } from "@/components/dashboard/RelatorioExecutivo";
import { BuscaTarefas, FILTROS_INICIAIS, FiltroStatusTarefas, FiltrosTarefas, aplicarFiltros } from "@/components/tarefas/FiltrosTarefas";

const DIAS_RELATORIO = 21;

export default function DashboardPage() {
  const { profile } = useAuth();
  const pracas = profile ? pracasVisiveis(profile) : [];
  const quadrosEscalonamento = profile ? quadrosEscalonamentoVisiveis(profile) : [];
  const quadrosBusca = profile ? quadrosParaBuscar(profile) : [];
  const meusQuadros = profile ? meuQuadroInterativo(profile) : [];
  const { tarefas, loading, erro } = useTarefasPorQuadros(quadrosBusca);
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [novaTarefaAberta, setNovaTarefaAberta] = useState(false);
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const podeVerRelatorio = !!profile && podeVerAnalytics(profile.role);
  const { dados: dadosRelatorio, erro: erroRelatorio } = usePainelAnalitico(DIAS_RELATORIO, podeVerRelatorio && relatorioAberto);
  const visao = useMemo(
    () => aplicarFiltros({ pracas, quadrosEscalonamento, tarefas }, filtros),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tarefas, filtros, profile]
  );

  const resumoRelatorio = useMemo(() => {
    if (!dadosRelatorio) return null;
    const ranking = dadosRelatorio.ranking;
    const soma = (f: (r: (typeof ranking)[number]) => number) => ranking.reduce((s, r) => s + f(r), 0);
    const total = soma((r) => r.totalPendencias);
    const falhas = soma((r) => r.falhasAuditoria);
    const maior = [...dadosRelatorio.evolucao.gargalos].sort((a, b) => b.diasMedios - a.diasMedios)[0];
    return {
      total,
      resolvidas: soma((r) => r.resolvidas),
      falhas,
      taxaFalha: total ? Math.round((falhas / total) * 1000) / 10 : 0,
      etapaGargalo: maior ? `Etapa ${maior.etapa}` : "—",
    };
  }, [dadosRelatorio]);

  if (!profile) return null;

  // Assistentes têm visão em túnel (só a própria coluna): sem barra de filtros.
  const mostrarFiltros = profile.role !== "assistente";
  const semColunas = visao.pracas.length === 0 && visao.quadrosEscalonamento.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Topbar titulo={`Olá, ${profile.nome.split(" ")[0]}`} />

      {podeVerRelatorio && (
        <div className="flex justify-end">
          <button type="button" className="btn-secondary h-10 shrink-0" onClick={() => setRelatorioAberto(true)}>
            <Printer size={16} />
            Emitir Relatório Executivo
          </button>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Não foi possível carregar as tarefas.</p>
            <p className="mt-1 text-xs">{erro}</p>
          </div>
        </div>
      )}

      {quadrosBusca.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Seu usuário não está associado a nenhum quadro. Fale com a coordenação.
        </p>
      ) : (
        <>
          {/* Assistentes não têm a barra de filtros completa, mas têm busca e A fazer / Feitas. */}
          {!mostrarFiltros && (
            <div className="flex flex-wrap items-end gap-3">
              <BuscaTarefas valor={filtros.busca} onChange={(busca) => setFiltros({ ...filtros, busca })} />
              <FiltroStatusTarefas valor={filtros.status} onChange={(status) => setFiltros({ ...filtros, status })} />
            </div>
          )}
          {mostrarFiltros && (
            <FiltrosTarefas
              pracas={pracas}
              quadrosEscalonamento={quadrosEscalonamento}
              valor={filtros}
              onChange={setFiltros}
              acao={
                destinatariosPermitidos(profile.role).length > 0 && (
                  <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setNovaTarefaAberta(true)}>
                    <Plus size={16} />
                    Nova Tarefa
                  </button>
                )
              }
            />
          )}
          {semColunas ? (
            <p className="text-sm text-ink-muted">Nenhum quadro corresponde aos filtros selecionados.</p>
          ) : (
            <TaskBoard
              role={profile.role}
              pracas={visao.pracas}
              tarefas={visao.tarefas}
              loading={loading}
              meusQuadros={meusQuadros}
              quadrosEscalonamento={visao.quadrosEscalonamento}
            />
          )}
        </>
      )}

      {novaTarefaAberta && <NovaTarefaModal onFechar={() => setNovaTarefaAberta(false)} />}

      {relatorioAberto && dadosRelatorio && resumoRelatorio && (
        <RelatorioExecutivo
          dados={dadosRelatorio}
          resumo={resumoRelatorio}
          periodoDias={DIAS_RELATORIO}
          onFechar={() => setRelatorioAberto(false)}
        />
      )}
      {relatorioAberto && !dadosRelatorio && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/90 print:hidden">
          <p className="text-sm text-ink-muted">{erroRelatorio ?? "Carregando dados do relatório…"}</p>
          <button type="button" className="btn-secondary h-10" onClick={() => setRelatorioAberto(false)}>
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
