"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { RankingParceiro } from "@/lib/services/analiseParceiros";
import { cn } from "@/lib/utils/cn";
import { EmptyState } from "./EmptyState";

type Coluna = keyof Pick<
  RankingParceiro,
  "totalPendencias" | "resolvidas" | "falhasAuditoria" | "taxaFalhaPct" | "tempoMedioResolucaoDias"
>;

const COLUNAS: { chave: Coluna; label: string }[] = [
  { chave: "totalPendencias", label: "Pendências" },
  { chave: "resolvidas", label: "Resolvidas" },
  { chave: "falhasAuditoria", label: "Devolvidas (falha)" },
  { chave: "taxaFalhaPct", label: "Taxa de falha" },
  { chave: "tempoMedioResolucaoDias", label: "Tempo médio (dias)" },
];

export function RankingParceiros({ ranking }: { ranking: RankingParceiro[] }) {
  const [ordenarPor, setOrdenarPor] = useState<Coluna>("totalPendencias");
  const [desc, setDesc] = useState(true);

  const ordenado = useMemo(() => {
    return [...ranking].sort((a, b) => {
      const va = a[ordenarPor] ?? -1;
      const vb = b[ordenarPor] ?? -1;
      return desc ? vb - va : va - vb;
    });
  }, [ranking, ordenarPor, desc]);

  if (ranking.length === 0) {
    return <EmptyState texto="Nenhuma pendência registrada ainda para montar o ranking de parceiros." />;
  }

  function ordenarPorColuna(coluna: Coluna) {
    if (coluna === ordenarPor) setDesc((d) => !d);
    else {
      setOrdenarPor(coluna);
      setDesc(true);
    }
  }

  return (
    <div className="surface-card p-5">
      <h2 className="mb-1 text-base font-bold text-ink-primary dark:text-white">Ranking de Parceiros</h2>
      <p className="mb-4 text-xs text-ink-secondary dark:text-white/60">
        Desempenho por imobiliária: velocidade de resolução e pastas devolvidas por falha de auditoria.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted dark:border-white/10">
              <th className="py-2 pr-3">Imobiliária</th>
              {COLUNAS.map((c) => (
                <th key={c.chave} className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => ordenarPorColuna(c.chave)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-ink-primary dark:hover:text-white",
                      ordenarPor === c.chave && "text-ink-primary dark:text-white"
                    )}
                  >
                    {c.label}
                    {ordenarPor === c.chave && (desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenado.map((r) => (
              <tr key={r.imobiliaria} className="border-b border-border/60 dark:border-white/5">
                <td className="py-2 pr-3 font-medium text-ink-primary dark:text-white">{r.imobiliaria}</td>
                <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">{r.totalPendencias}</td>
                <td className="py-2 pr-3 text-status-success">{r.resolvidas}</td>
                <td className="py-2 pr-3 text-status-danger">{r.falhasAuditoria}</td>
                <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">{r.taxaFalhaPct}%</td>
                <td className="py-2 pr-3 text-ink-secondary dark:text-white/70">
                  {r.tempoMedioResolucaoDias ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
