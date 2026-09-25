"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { ClienteEnvolvido, EtapaHistorico } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils/cn";
import { ObservacaoChecklist, TrajetoPasta } from "./partesCard";

/**
 * NÍVEL 2 da sanfona de gargalo: lista simples (checkbox + nome de cada cliente).
 * Clicar no NOME abre o detalhe completo daquele cliente (nível 3, em modal).
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

      {clienteAberto && <DetalheClienteModal cliente={clienteAberto} onFechar={() => setAberto(null)} />}
    </>
  );
}

/**
 * NÍVEL 3: detalhe completo de UM cliente do gargalo, no mesmo formato de um card
 * individual — imobiliária, "O que foi relatado" e a linha do tempo diária completa.
 */
function DetalheClienteModal({ cliente, onFechar }: { cliente: ClienteEnvolvido; onFechar: () => void }) {
  // A tarefa guarda só as últimas entradas de cada cliente (limite de tamanho do documento);
  // o trajeto integral está no registro da pasta.
  const [historico, setHistorico] = useState<EtapaHistorico[]>(cliente.historicoEtapas ?? []);

  useEffect(() => {
    let ativo = true;
    getDoc(doc(db, "registros", cliente.numero))
      .then((snap) => {
        const completo = snap.data()?.historicoEtapas as EtapaHistorico[] | undefined;
        if (ativo && completo && completo.length > historico.length) setHistorico(completo);
      })
      .catch(() => {
        // sem permissão/rede: segue com as entradas embutidas na tarefa
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.numero]);

  return (
    <Modal titulo={cliente.clienteNome || `Pasta ${cliente.numero}`} onClose={onFechar}>
      <div className="space-y-4">
        <p className="-mt-2 text-xs text-ink-muted">{cliente.imobiliaria || "Imobiliária não informada"}</p>

        {cliente.observacao && (
          <div className="rounded-md border border-border bg-surface-secondary/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">O que foi relatado</p>
            <ObservacaoChecklist texto={cliente.observacao} />
          </div>
        )}

        <div className="border-t border-border pt-3 dark:border-white/10">
          <TrajetoPasta dados={{ dataEntrada: cliente.dataEntrada, etapa: cliente.etapa, historicoEtapas: historico }} />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button type="button" className="btn-secondary h-10" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
