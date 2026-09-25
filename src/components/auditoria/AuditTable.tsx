"use client";

import { useMemo, useState } from "react";
import { useRegistros } from "@/lib/hooks/useRegistros";
import { normalize } from "@/lib/auth/roles";
import { SLA_BADGE_CLASSES, SLA_LABEL } from "@/lib/utils/sla";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

export function AuditTable() {
  const { registros, loading } = useRegistros();
  const [busca, setBusca] = useState("");
  const [verConcluidas, setVerConcluidas] = useState(false);

  const totalConcluidas = useMemo(() => registros.filter((r) => r.arquivada).length, [registros]);

  const filtrados = useMemo(() => {
    const base = registros.filter((r) => Boolean(r.arquivada) === verConcluidas);
    const termo = normalize(busca);
    if (!termo) return base;
    return base.filter((r) =>
      [r.numero, r.cpfCnpj, r.cidade, r.responsavel, r.etapa].some((v) => normalize(v ?? "").includes(termo))
    );
  }, [registros, busca, verConcluidas]);

  return (
    <div className="surface-card p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <h2 className="text-base font-bold text-ink-primary dark:text-white">
          {verConcluidas ? "Vendas Concluídas" : "Tabela de Auditoria"} ({filtrados.length})
        </h2>
        <button type="button" className="btn-secondary h-11 sm:h-10" onClick={() => setVerConcluidas((v) => !v)}>
          {verConcluidas ? "Ver pastas em andamento" : `Vendas Concluídas (${totalConcluidas})`}
        </button>
        <input
          className="input-field h-11 w-full sm:h-10 sm:max-w-xs"
          placeholder="Buscar por número, CPF, cidade, imobiliária…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-ink-muted">Carregando registros…</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum registro encontrado. Importe uma planilha para começar.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted dark:border-white/10">
                <th className="py-2 pr-3">Número</th>
                <th className="py-2 pr-3">Cidade</th>
                <th className="py-2 pr-3">Responsável</th>
                <th className="py-2 pr-3">Etapa</th>
                <th className="py-2 pr-3">Prazo</th>
                <th className="py-2 pr-3">SLA</th>
                <th className="py-2 pr-3">Observação</th>
                <th className="py-2 pr-3">Atualizado em</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((r) => (
                <tr key={r.numero} className="border-b border-border/60 dark:border-white/5">
                  <td className="py-2 pr-3 font-medium text-ink-primary dark:text-white">{r.numero}</td>
                  <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">{r.cidade}</td>
                  <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">{r.responsavel}</td>
                  <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">{r.etapa}</td>
                  <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">{formatDateBR(r.prazoEtapa)}</td>
                  <td className="py-2 pr-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", SLA_BADGE_CLASSES[r.slaStatus])}>
                      {SLA_LABEL[r.slaStatus]}
                    </span>
                  </td>
                  <td className="max-w-xs truncate py-2 pr-3 text-ink-secondary dark:text-white/70" title={r.observacao}>
                    {r.observacao || "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-ink-muted">{formatDateTimeBR(r.atualizadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
