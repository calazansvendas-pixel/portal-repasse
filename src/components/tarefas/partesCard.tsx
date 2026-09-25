"use client";

import { useEffect, useRef } from "react";
import type { EtapaHistorico, NotaResolucao } from "@/lib/types";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils/dates";
import { fatiarObservacao } from "@/lib/utils/texto";
import { cn } from "@/lib/utils/cn";

export function ObservacaoChecklist({ texto }: { texto: string }) {
  const itens = fatiarObservacao(texto);
  if (itens.length === 0) return null;
  return (
    <ul className="max-h-48 space-y-1.5 overflow-y-auto overscroll-contain scroll-smooth pr-1">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-1.5 break-words text-[13px] leading-relaxed text-ink-secondary sm:text-xs dark:text-white/70">
          <span className="mt-0.5 shrink-0 text-ink-muted">▢</span>
          <span className="min-w-0">{item}</span>
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
  const rolagem = useRef<HTMLDivElement>(null);
  const totalPassos = passos.length;

  // Linha do tempo longa rola por dentro; começa no fim, onde está a situação mais recente.
  useEffect(() => {
    const el = rolagem.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [totalPassos]);

  return (
    <>
    <div ref={rolagem} className="max-h-56 overflow-y-auto overscroll-contain scroll-smooth pr-1">
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
                  "min-w-0 break-words text-[13px] sm:text-xs",
                  ultimo ? "font-semibold text-ink-primary dark:text-white" : "text-ink-secondary dark:text-white/60"
                )}
              >
                {passo.titulo}
              </span>
              <span className="shrink-0 text-[11px] text-ink-muted">{formatDateBR(passo.data)}</span>
            </div>
          </li>
        );
      })}
    </ol>
    </div>
    {ultimaPlanilha && (
      <p className="mt-2 border-t border-border pt-2 text-[11px] text-ink-muted dark:border-white/10">
        Última planilha importada: {formatDateBR(ultimaPlanilha)}
      </p>
    )}
    </>
  );
}

interface FonteDeNotas {
  historicoNotas?: NotaResolucao[] | null;
  notaResolucao?: string | null;
  resolvidoEm?: string | null;
}

/** Histórico de tentativas; notas antigas (sem histórico) aparecem como uma única entrada. */
export function notasDe(fonte: FonteDeNotas | undefined, incluirLegada = true): NotaResolucao[] {
  if (!fonte) return [];

  // Se há histórico, usá-lo (com validação de tipo para dados legados)
  if (Array.isArray(fonte.historicoNotas) && fonte.historicoNotas.length > 0) {
    return fonte.historicoNotas.filter((n): n is NotaResolucao => n && typeof n === "object" && "texto" in n);
  }

  // Fallback legado: string simples em notaResolucao
  if (incluirLegada && typeof fonte.notaResolucao === "string" && fonte.notaResolucao.trim()) {
    return [{ texto: fonte.notaResolucao, data: fonte.resolvidoEm ?? "" }];
  }

  return [];
}

/** Linha do tempo das tentativas ("O que foi feito"): mais antiga em cima, data/hora e autor em cada uma. */
export function HistoricoNotas({ notas }: { notas: NotaResolucao[] }) {
  const rolagem = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rolagem.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [notas.length]);

  return (
    <div ref={rolagem} className="max-h-48 overflow-y-auto overscroll-contain scroll-smooth pr-1">
      <ol className="space-y-2.5">
        {notas.map((n, i) => (
          <li key={i} className="border-l-2 border-brand-primary/30 pl-2.5">
            <p className="text-[11px] text-ink-muted">
              {[n.data ? formatDateTimeBR(n.data) : null, n.autor].filter(Boolean).join(" - ")}
            </p>
            <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-ink-secondary sm:text-xs dark:text-white/70">
              {n.texto}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
