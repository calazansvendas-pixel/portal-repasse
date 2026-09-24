"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useImportacoes } from "@/lib/hooks/useImportacoes";
import { excluirImportacao } from "@/lib/services/importacoesService";
import type { Importacao } from "@/lib/types";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

export function HistoricoImportacoes() {
  const { profile, firebaseUser } = useAuth();
  const { importacoes, loading } = useImportacoes();
  const podeExcluir = profile?.role === "gerencia";

  if (loading) return null;
  if (importacoes.length === 0) return null;

  return (
    <div className="surface-card p-5">
      <h2 className="mb-1 text-base font-bold text-ink-primary dark:text-white">
        Histórico de Importações
      </h2>
      <p className="mb-4 text-xs text-ink-secondary dark:text-white/60">
        O &quot;filme da operação&quot;: cada linha é um dia de planilha processado pelo motor de auditoria.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted dark:border-white/10">
              <th className="py-2 pr-3">Dia</th>
              <th className="py-2 pr-3">Arquivo</th>
              <th className="py-2 pr-3">Novas</th>
              <th className="py-2 pr-3">Atualizadas</th>
              <th className="py-2 pr-3">Tarefas criadas</th>
              <th className="py-2 pr-3">Validadas</th>
              <th className="py-2 pr-3">Falhas de auditoria</th>
              <th className="py-2 pr-3">Importado em</th>
              {podeExcluir && <th className="py-2 pr-3" />}
            </tr>
          </thead>
          <tbody>
            {importacoes.map((imp) => (
              <LinhaImportacao
                key={imp.id}
                importacao={imp}
                podeExcluir={podeExcluir}
                idToken={firebaseUser ? () => firebaseUser.getIdToken() : null}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaImportacao({
  importacao: imp,
  podeExcluir,
  idToken,
}: {
  importacao: Importacao;
  podeExcluir: boolean;
  idToken: (() => Promise<string>) | null;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmando) return;
    const timer = setTimeout(() => setConfirmando(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmando]);

  async function handleExcluir() {
    if (!idToken) return;
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setExcluindo(true);
    setErro(null);
    try {
      const token = await idToken();
      await excluirImportacao(imp.id, token);
      // A linha some sozinha via onSnapshot quando o doc for removido.
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao excluir.");
      setConfirmando(false);
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <tr className="border-b border-border/60 dark:border-white/5">
      <td className="py-2 pr-3 font-medium text-ink-primary dark:text-white">{formatDateBR(imp.id)}</td>
      <td className="max-w-[180px] truncate py-2 pr-3 text-ink-secondary dark:text-white/70" title={imp.nomeArquivo}>
        {imp.nomeArquivo}
      </td>
      <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">{imp.novos}</td>
      <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">{imp.atualizados}</td>
      <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">{imp.tarefasCriadas}</td>
      <td className="py-2 pr-3 text-status-success">{imp.tarefasValidadas}</td>
      <td className="py-2 pr-3 text-status-danger">{imp.falhasAuditoria}</td>
      <td className="py-2 pr-3 text-xs text-ink-muted">{formatDateTimeBR(imp.importadoEm)}</td>
      {podeExcluir && (
        <td className="py-2 pr-3">
          <div className="flex items-center justify-end gap-1.5">
            {erro && (
              <span title={erro}>
                <AlertTriangle size={14} className="text-status-danger" />
              </span>
            )}
            <button
              type="button"
              onClick={handleExcluir}
              disabled={excluindo}
              title={confirmando ? "Clique de novo para confirmar" : "Excluir importação"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                confirmando
                  ? "border-status-danger bg-status-danger text-white hover:bg-status-danger/90"
                  : "border-border text-ink-muted hover:border-status-danger/40 hover:text-status-danger dark:border-white/15"
              )}
            >
              {excluindo ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {confirmando ? "Confirmar" : ""}
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
