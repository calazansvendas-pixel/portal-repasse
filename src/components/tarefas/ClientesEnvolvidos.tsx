"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { ClienteEnvolvido } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { HistoricoNotas, notasDe } from "./partesCard";

/**
 * NÍVEL 2 da sanfona de gargalo: lista simples (checkbox + nome de cada cliente).
 * Clicar no NOME abre o detalhe daquele cliente (nível 3): o card individual completo,
 * montado por quem chama em `renderDetalhe`.
 */
export function ListaClientesEnvolvidos({
  clientes,
  podeMarcar,
  onAlternar,
  renderDetalhe,
}: {
  clientes: ClienteEnvolvido[];
  podeMarcar: boolean;
  onAlternar?: (numero: string) => void;
  renderDetalhe: (cliente: ClienteEnvolvido, fechar: () => void) => ReactNode;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const clienteAberto = clientes.find((c) => c.numero === aberto) ?? null;

  return (
    <>
      <ul className="divide-y divide-border rounded-md border border-border dark:divide-white/10 dark:border-white/10">
        {clientes.map((c) => (
          <li key={c.numero}>
          {/* Linha inteira com pelo menos 48px de altura: a área do checkbox (44px de largura) e a do
              nome/chevron são alvos de toque separados, para o dedo não acionar um no lugar do outro. */}
          <div className="flex min-h-[48px] items-stretch">
            <label
              className={cn(
                "flex w-12 shrink-0 items-center justify-center",
                podeMarcar ? "cursor-pointer active:bg-surface-soft dark:active:bg-white/10" : "cursor-default"
              )}
            >
              <input
                type="checkbox"
                checked={c.concluido}
                disabled={!podeMarcar}
                onChange={() => onAlternar?.(c.numero)}
                aria-label={`Concluir ${c.clienteNome || c.numero}`}
                className="h-5 w-5 shrink-0 accent-brand-primary disabled:cursor-default"
              />
            </label>
            <button
              type="button"
              onClick={() => setAberto(c.numero)}
              title="Ver detalhes do cliente"
              className="group flex min-w-0 flex-1 items-center justify-between gap-2 py-2.5 pr-3 text-left active:bg-surface-soft dark:active:bg-white/10"
            >
              <span
                className={cn(
                  "min-w-0 break-words text-sm font-medium group-hover:underline sm:text-xs",
                  c.concluido ? "text-ink-muted line-through" : "text-ink-primary dark:text-white"
                )}
              >
                {c.clienteNome || `Pasta ${c.numero}`}
              </span>
              <ChevronRight size={20} className="shrink-0 text-ink-muted" />
            </button>
          </div>
          {/* Histórico imutável visível para clientes ativos e concluídos. */}
          {notasDe(c).length > 0 && (
            <div className="pb-2.5 pl-12 pr-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                O que foi feito
              </p>
              <HistoricoNotas notas={notasDe(c)} />
            </div>
          )}
          </li>
        ))}
      </ul>

      {clienteAberto && renderDetalhe(clienteAberto, () => setAberto(null))}
    </>
  );
}
