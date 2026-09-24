"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { pracasVisiveis } from "@/lib/auth/roles";
import { useTarefasPorPracas } from "@/lib/hooks/useTarefas";
import { Topbar } from "@/components/layout/Topbar";
import { TaskBoard } from "@/components/tarefas/TaskBoard";

export default function TarefasPage() {
  const { profile } = useAuth();
  const pracas = profile ? pracasVisiveis(profile) : [];
  const { tarefas, loading } = useTarefasPorPracas(pracas);
  if (!profile) return null;

  const somenteLeitura = profile.role !== "assistente";

  return (
    <div>
      <Topbar titulo="Quadros de Tarefas" />
      {pracas.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Seu usuário não está associado a nenhuma praça. Fale com a coordenação.
        </p>
      ) : (
        <TaskBoard pracas={pracas} tarefas={tarefas} loading={loading} somenteLeitura={somenteLeitura} />
      )}
    </div>
  );
}
