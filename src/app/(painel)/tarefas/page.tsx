"use client";

import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { pracasVisiveis, quadrosEscalonamentoVisiveis, quadrosParaBuscar, meuQuadroInterativo } from "@/lib/auth/roles";
import { useTarefasPorQuadros } from "@/lib/hooks/useTarefas";
import { Topbar } from "@/components/layout/Topbar";
import { TaskBoard } from "@/components/tarefas/TaskBoard";

export default function TarefasPage() {
  const { profile } = useAuth();
  const pracas = profile ? pracasVisiveis(profile) : [];
  const quadrosEscalonamento = profile ? quadrosEscalonamentoVisiveis(profile) : [];
  const quadrosBusca = profile ? quadrosParaBuscar(profile) : [];
  const meusQuadros = profile ? meuQuadroInterativo(profile) : [];
  const { tarefas, loading, erro } = useTarefasPorQuadros(quadrosBusca);
  if (!profile) return null;

  return (
    <div>
      <Topbar titulo="Quadros de Tarefas" />

      {erro && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
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
        <TaskBoard
          pracas={pracas}
          tarefas={tarefas}
          loading={loading}
          meusQuadros={meusQuadros}
          quadrosEscalonamento={quadrosEscalonamento}
        />
      )}
    </div>
  );
}
