"use client";

import Image from "next/image";
import { Printer, X } from "lucide-react";
import type { GrupoImobiliariaDados } from "@/lib/server/relatorioImobiliarias";
import { formatDateBR } from "@/lib/utils/dates";

/**
 * Relatório executivo do "Relatório Imobiliárias", gerado a partir dos filtros que já estão
 * aplicados na tela (imobiliária/cidade/produto/etapa+dias) — mesmo padrão visual e de impressão
 * do RelatorioExecutivo.tsx (overlay cobrindo a tela + `#relatorio-executivo` isolado no print).
 */
export function RelatorioFiltradoImobiliarias({
  grupos,
  filtros,
  onFechar,
}: {
  grupos: GrupoImobiliariaDados[];
  filtros: string[];
  onFechar: () => void;
}) {
  const totalPastas = grupos.reduce((s, g) => s + g.total, 0);
  const geradoEm = new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white print:static print:overflow-visible">
      <div className="flex items-center justify-between gap-3 border-b border-ink-primary/10 bg-surface-soft px-4 py-3 print:hidden">
        <p className="text-sm text-ink-secondary">Pré-visualização do relatório — a impressão usa só o conteúdo abaixo.</p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary h-10" onClick={() => window.print()}>
            <Printer size={16} />
            Imprimir / Salvar PDF
          </button>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-ink-primary/5"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div id="relatorio-executivo" className="mx-auto max-w-3xl px-8 py-10 text-[#1F2417] print:px-0 print:py-0">
        <header className="flex items-center justify-between gap-4 border-b-2 border-[#2F6B3C] pb-4">
          <div className="flex items-center gap-3">
            <Image src="/logos/logo-morar-verde.png" alt="Morar" width={40} height={40} />
            <div>
              <h1 className="text-lg font-bold">Relatório de Imobiliárias</h1>
              <p className="text-xs text-[#5B6356]">Prestação de contas — andamento de pastas por parceiro</p>
            </div>
          </div>
          <p className="text-right text-[11px] text-[#5B6356]">Gerado em {geradoEm}</p>
        </header>

        <section className="mt-4">
          <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide text-[#2F6B3C]">Filtros aplicados</h2>
          {filtros.length === 0 ? (
            <p className="text-sm text-[#5B6356]">Nenhum filtro — todas as pastas.</p>
          ) : (
            <ul className="list-inside list-disc text-sm text-[#5B6356]">
              {filtros.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#2F6B3C]">
            Resumo — {totalPastas} pasta(s) em {grupos.length} imobiliária(s)
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#1F2417]/20 text-left text-[11px] uppercase text-[#5B6356]">
                <th className="py-1.5">Imobiliária</th>
                <th className="py-1.5 text-right">Pastas</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.nome} className="border-b border-[#1F2417]/10">
                  <td className="py-1.5">{g.nome}</td>
                  <td className="py-1.5 text-right tabular-nums">{g.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {grupos.map((g) => (
          <section key={g.nome} className="mt-6 break-inside-avoid">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#2F6B3C]">{g.nome}</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#1F2417]/20 text-left text-[11px] uppercase text-[#5B6356]">
                  <th className="py-1.5">Pasta</th>
                  <th className="py-1.5">Cliente</th>
                  <th className="py-1.5">Etapa atual</th>
                  <th className="py-1.5 text-right">Prazo</th>
                </tr>
              </thead>
              <tbody>
                {g.lista.map((p) => (
                  <tr key={p.numero} className="border-b border-[#1F2417]/10">
                    <td className="py-1.5">{p.numero}</td>
                    <td className="py-1.5">{p.clienteNome || "—"}</td>
                    <td className="py-1.5">{p.etapa || "—"}</td>
                    <td className="py-1.5 text-right">{formatDateBR(p.prazoEtapa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <footer className="mt-10 border-t border-[#1F2417]/10 pt-3 text-[10px] text-[#5B6356]">
          Portal de Repasse — Morar Construtora e Incorporadora. Documento gerado automaticamente a partir dos dados importados.
        </footer>
      </div>
    </div>
  );
}
