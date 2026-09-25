"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  pracasVisiveis,
  quadrosEscalonamentoVisiveis,
  quadrosParaBuscar,
  meuQuadroInterativo,
  destinatariosPermitidos,
} from "@/lib/auth/roles";
import { useTarefasPorQuadros } from "@/lib/hooks/useTarefas";
import { Topbar } from "@/components/layout/Topbar";
import { TaskBoard } from "@/components/tarefas/TaskBoard";
import { NovaTarefaModal } from "@/components/tarefas/NovaTarefaModal";
import { FILTROS_INICIAIS, FiltrosTarefas, aplicarFiltros } from "@/components/tarefas/FiltrosTarefas";

export default function DashboardPage() {
  const { profile } = useAuth();
  const pracas = profile ? pracasVisiveis(profile) : [];
  const quadrosEscalonamento = profile ? quadrosEscalonamentoVisiveis(profile) : [];
  const quadrosBusca = profile ? quadrosParaBuscar(profile) : [];
  const meusQuadros = profile ? meuQuadroInterativo(profile) : [];
  const { tarefas, loading, erro } = useTarefasPorQuadros(quadrosBusca);
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [novaTarefaAberta, setNovaTarefaAberta] = useState(false);
  const visao = useMemo(
    () => aplicarFiltros({ pracas, quadrosEscalonamento, tarefas }, filtros),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tarefas, filtros, profile]
  );

  if (!profile) return null;

  // Assistentes têm visão em túnel (só a própria coluna): sem barra de filtros.
  const mostrarFiltros = profile.role !== "assistente";
  const semColunas = visao.pracas.length === 0 && visao.quadrosEscalonamento.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Topbar titulo={`Olá, ${profile.nome.split(" ")[0]}`} />

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
          {mostrarFiltros && (
            <FiltrosTarefas
              pracas={pracas}
              quadrosEscalonamento={quadrosEscalonamento}
              valor={filtros}
              onChange={setFiltros}
              acao={
                destinatariosPermitidos(profile.role).length > 0 && (
                  <button type="button" className="btn-primary" onClick={() => setNovaTarefaAberta(true)}>
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
    </div>
  );
}
