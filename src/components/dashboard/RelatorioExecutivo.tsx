"use client";

import Image from "next/image";
import { Printer, X } from "lucide-react";
import type { PainelAnalitico } from "@/lib/hooks/usePainelAnalitico";
import type { RankingParceiro } from "@/lib/services/analiseParceiros";

export interface ResumoExecutivo {
  total: number;
  resolvidas: number;
  falhas: number;
  taxaFalha: number;
  etapaGargalo: string;
}

// Imobiliária "crítica": acima deste piso de pendências, a taxa de falha passa a ser um sinal
// confiável (poucas pendências com 1 falha já dariam 100%, o que não quer dizer nada).
const PISO_PENDENCIAS_CRITICA = 3;
const MAX_IMOBILIARIAS_CRITICAS = 8;
const MAX_GARGALOS = 6;

const ROLE_LABEL_RELATORIO: Record<string, string> = {
  assistente: "Assistente",
  coordenador: "Coordenador",
  analista: "Analista",
};

function imobiliariasCriticas(ranking: RankingParceiro[]): RankingParceiro[] {
  return [...ranking]
    .filter((r) => r.totalPendencias >= PISO_PENDENCIAS_CRITICA && r.taxaFalhaPct > 0)
    .sort((a, b) => b.taxaFalhaPct - a.taxaFalhaPct)
    .slice(0, MAX_IMOBILIARIAS_CRITICAS);
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Relatório executivo, pronto para impressão/PDF: cobre a tela inteira (inclusive por cima do
 * Sidebar) quando aberto, e o CSS `@media print` em globals.css esconde tudo exceto
 * `#relatorio-executivo` ao chamar `window.print()` — nenhum componente de layout precisa saber
 * que o relatório existe.
 */
export function RelatorioExecutivo({
  dados,
  resumo,
  periodoDias,
  onFechar,
}: {
  dados: PainelAnalitico;
  resumo: ResumoExecutivo;
  periodoDias: number;
  onFechar: () => void;
}) {
  const criticas = imobiliariasCriticas(dados.ranking);
  const gargalos = dados.evolucao.gargalos.slice(0, MAX_GARGALOS);
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
              <h1 className="text-lg font-bold">Relatório Executivo — Esteira de Repasse</h1>
              <p className="text-xs text-[#5B6356]">Últimos {periodoDias} dias importados</p>
            </div>
          </div>
          <p className="text-right text-[11px] text-[#5B6356]">Gerado em {geradoEm}</p>
        </header>

        {dados.ultimaImportacao && (
          <p className="mt-3 text-xs text-[#5B6356]">
            Dados da última planilha importada em {formatarDataHora(dados.ultimaImportacao.atualizadoEm)} (referência{" "}
            {dados.ultimaImportacao.id}).
          </p>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#2F6B3C]">Resumo de indicadores</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiBox label="Pendências geradas" valor={resumo.total} />
            <KpiBox label="Resolvidas" valor={resumo.resolvidas} />
            <KpiBox label="Devolvidas (falha)" valor={resumo.falhas} />
            <KpiBox label="Taxa de falha" valor={`${resumo.taxaFalha}%`} />
            <KpiBox label="Maior gargalo" valor={resumo.etapaGargalo} />
            <KpiBox label="Documentação incompleta (1.17)" valor={`${dados.taxaDocumentacaoIncompletaPct}%`} />
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#2F6B3C]">Principais gargalos por etapa</h2>
          {gargalos.length === 0 ? (
            <p className="text-sm text-[#5B6356]">Sem gargalos relevantes no período.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#1F2417]/20 text-left text-[11px] uppercase text-[#5B6356]">
                  <th className="py-1.5">Etapa</th>
                  <th className="py-1.5 text-right">Dias médios parado</th>
                </tr>
              </thead>
              <tbody>
                {gargalos.map((g) => (
                  <tr key={g.etapa} className="border-b border-[#1F2417]/10">
                    <td className="py-1.5">{g.etapa}</td>
                    <td className="py-1.5 text-right tabular-nums">{g.diasMedios}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#2F6B3C]">Produtividade por colaborador</h2>
          {dados.produtividade.length === 0 ? (
            <p className="text-sm text-[#5B6356]">Nenhum colaborador com quadro próprio cadastrado.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#1F2417]/20 text-left text-[11px] uppercase text-[#5B6356]">
                  <th className="py-1.5">Colaborador</th>
                  <th className="py-1.5">Papel</th>
                  <th className="py-1.5 text-right">Ativas</th>
                  <th className="py-1.5 text-right">Concluídas</th>
                  <th className="py-1.5 text-right">Tempo médio</th>
                  <th className="py-1.5 text-right">Dentro do prazo</th>
                </tr>
              </thead>
              <tbody>
                {dados.produtividade.map((c) => (
                  <tr key={c.colaboradorId} className="border-b border-[#1F2417]/10">
                    <td className="py-1.5">{c.colaboradorNome}</td>
                    <td className="py-1.5">{ROLE_LABEL_RELATORIO[c.role] ?? c.role}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.ativas}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.concluidasNoPeriodo}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {c.tempoMedioConclusaoDias === null ? "—" : `${c.tempoMedioConclusaoDias} d`}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {c.taxaDentroDoPrazoPct === null ? "—" : `${c.taxaDentroDoPrazoPct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#2F6B3C]">Imobiliárias críticas</h2>
          <p className="mb-2 text-[11px] text-[#5B6356]">
            Parceiras com {PISO_PENDENCIAS_CRITICA}+ pendências no período, ordenadas pela maior taxa de falha de auditoria.
          </p>
          {criticas.length === 0 ? (
            <p className="text-sm text-[#5B6356]">Nenhuma imobiliária em situação crítica no período.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#1F2417]/20 text-left text-[11px] uppercase text-[#5B6356]">
                  <th className="py-1.5">Imobiliária</th>
                  <th className="py-1.5 text-right">Pendências</th>
                  <th className="py-1.5 text-right">Falhas</th>
                  <th className="py-1.5 text-right">Taxa de falha</th>
                </tr>
              </thead>
              <tbody>
                {criticas.map((r) => (
                  <tr key={r.imobiliaria} className="border-b border-[#1F2417]/10">
                    <td className="py-1.5">{r.imobiliaria}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.totalPendencias}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.falhasAuditoria}</td>
                    <td className="py-1.5 text-right tabular-nums">{r.taxaFalhaPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="mt-10 border-t border-[#1F2417]/10 pt-3 text-[10px] text-[#5B6356]">
          Portal de Repasse — Morar Construtora e Incorporadora. Documento gerado automaticamente a partir dos dados importados.
        </footer>
      </div>
    </div>
  );
}

function KpiBox({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="rounded-md border border-[#1F2417]/10 p-3">
      <p className="text-[11px] text-[#5B6356]">{label}</p>
      <p className="text-lg font-bold tabular-nums">{valor}</p>
    </div>
  );
}
