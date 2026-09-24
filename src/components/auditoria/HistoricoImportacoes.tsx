"use client";

import { useImportacoes } from "@/lib/hooks/useImportacoes";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils/dates";

export function HistoricoImportacoes() {
  const { importacoes, loading } = useImportacoes();

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
        <table className="w-full min-w-[680px] border-collapse text-sm">
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
            </tr>
          </thead>
          <tbody>
            {importacoes.map((imp) => (
              <tr key={imp.id} className="border-b border-border/60 dark:border-white/5">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
