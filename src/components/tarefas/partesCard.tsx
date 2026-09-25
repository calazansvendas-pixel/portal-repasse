"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ClienteEnvolvido, EtapaHistorico } from "@/lib/types";
import { formatDateBR } from "@/lib/utils/dates";
import { fatiarObservacao } from "@/lib/utils/texto";
import { cn } from "@/lib/utils/cn";

export function ObservacaoChecklist({ texto }: { texto: string }) {
  const itens = fatiarObservacao(texto);
  if (itens.length === 0) return null;
  return (
    <ul className="space-y-1">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-ink-secondary dark:text-white/70">
          <span className="mt-0.5 shrink-0 text-ink-muted">▢</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

interface DadosTrajeto {
  dataEntrada?: string | null;
  etapa?: string;
  historicoEtapas?: EtapaHistorico[];
}

/** Data da última planilha em que a pasta apareceu (última entrada do log diário). */
export function dataUltimaPlanilha(historico: EtapaHistorico[] | undefined): string | null {
  return historico?.length ? historico[historico.length - 1].data : null;
}

/**
 * Stepper vertical: Entrada -> uma linha por planilha importada (log diário: a pasta parada
 * na mesma etapa aparece uma vez por dia), fechando com a data da última planilha.
 */
export function TrajetoPasta({ dados }: { dados: DadosTrajeto }) {
  const passos: { titulo: string; data: string | null }[] = [
    ...(dados.dataEntrada ? [{ titulo: "Entrada", data: dados.dataEntrada }] : []),
    ...(dados.historicoEtapas ?? []).map((h) => ({ titulo: `Etapa ${h.etapa}`, data: h.data })),
  ];
  if (passos.length === 0 && dados.etapa) {
    passos.push({ titulo: `Etapa ${dados.etapa}`, data: null });
  }
  const ultimaPlanilha = dataUltimaPlanilha(dados.historicoEtapas);

  return (
    <>
    <ol>
      {passos.map((passo, i) => {
        const ultimo = i === passos.length - 1;
        return (
          <li key={i} className="flex gap-2">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                  ultimo ? "bg-brand-primary" : "bg-border dark:bg-white/25"
                )}
              />
              {!ultimo && <span className="w-px flex-1 bg-border dark:bg-white/15" />}
            </div>
            <div className={cn("flex flex-1 items-center justify-between gap-2", !ultimo && "pb-2")}>
              <span
                className={cn(
                  "text-xs",
                  ultimo ? "font-semibold text-ink-primary dark:text-white" : "text-ink-secondary dark:text-white/60"
                )}
              >
                {passo.titulo}
              </span>
              <span className="text-[11px] text-ink-muted">{formatDateBR(passo.data)}</span>
            </div>
          </li>
        );
      })}
    </ol>
    {ultimaPlanilha && (
      <p className="mt-2 border-t border-border pt-2 text-[11px] text-ink-muted dark:border-white/10">
        Última planilha importada: {formatDateBR(ultimaPlanilha)}
      </p>
    )}
    </>
  );
}

/**
 * Sanfona de sub-tarefas de um gargalo: cada cliente tem o próprio check e,
 * ao clicar no nome, abre os detalhes (imobiliária, observação e trajeto).
 */
export function ListaClientesEnvolvidos({
  clientes,
  podeMarcar,
  onAlternar,
}: {
  clientes: ClienteEnvolvido[];
  podeMarcar: boolean;
  onAlternar?: (numero: string) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-border rounded-md border border-border dark:divide-white/10 dark:border-white/10">
      {clientes.map((c) => {
        const expandido = aberto === c.numero;
        return (
          <li key={c.numero} className="px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={c.concluido}
                disabled={!podeMarcar}
                onChange={() => onAlternar?.(c.numero)}
                aria-label={`Concluir ${c.clienteNome || c.numero}`}
                className="h-4 w-4 shrink-0 accent-brand-primary disabled:cursor-default"
              />
              <button
                type="button"
                onClick={() => setAberto(expandido ? null : c.numero)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
              >
                <span
                  className={cn(
                    "truncate text-xs font-medium",
                    c.concluido
                      ? "text-ink-muted line-through"
                      : "text-ink-primary dark:text-white"
                  )}
                >
                  {c.clienteNome || `Pasta ${c.numero}`}
                </span>
                {expandido ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
              </button>
            </div>

            {expandido && (
              <div className="mt-2 space-y-3 pl-6">
                <p className="text-xs text-ink-muted">{c.imobiliaria || "Imobiliária não informada"}</p>
                {c.observacao && <ObservacaoChecklist texto={c.observacao} />}
                <TrajetoPasta dados={c} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
