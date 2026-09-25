"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { ClienteEnvolvido } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

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
          <li key={c.numero} className="flex items-center gap-2 px-3 py-2">
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
              onClick={() => setAberto(c.numero)}
              title="Ver detalhes do cliente"
              className="group flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
            >
              <span
                className={cn(
                  "truncate text-xs font-medium group-hover:underline",
                  c.concluido ? "text-ink-muted line-through" : "text-ink-primary dark:text-white"
                )}
              >
                {c.clienteNome || `Pasta ${c.numero}`}
              </span>
              <ChevronRight size={14} className="shrink-0 text-ink-muted" />
            </button>
          </li>
        ))}
      </ul>

      {clienteAberto && renderDetalhe(clienteAberto, () => setAberto(null))}
    </>
  );
}
