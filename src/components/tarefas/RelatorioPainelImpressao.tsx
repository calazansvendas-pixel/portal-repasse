"use client";

import Image from "next/image";
import { FileSpreadsheet, Printer, X } from "lucide-react";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils/dates";
import type { RelatorioPainel } from "@/lib/services/relatorioPainel";

/** ExcelJS é uma biblioteca pesada (estilos, bordas, zebra striping) — importada só no clique do
 * botão, não no carregamento do /dashboard, pra não pesar o bundle de todo mundo que nunca exporta. */
async function exportarXlsx(relatorio: RelatorioPainel) {
  const { exportarRelatorioPainelXlsx } = await import("@/lib/services/exportarRelatorioXlsx");
  await exportarRelatorioPainelXlsx(relatorio);
}

/**
 * Pré-visualização/impressão do Relatório Gerencial de Atividades e Contatos — mesmo padrão de
 * overlay + `#relatorio-executivo` já usado pelos outros relatórios do app: cobre a tela inteira
 * e o CSS `@media print` em globals.css isola o conteúdo na impressão, sem nenhum componente de
 * layout precisar saber que este relatório existe.
 */
export function RelatorioPainelImpressao({ relatorio, onFechar }: { relatorio: RelatorioPainel; onFechar: () => void }) {
  const { sumario, grupos } = relatorio;
  const emitidoEm = new Date().toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" });
  const periodo =
    !sumario.periodoInicio && !sumario.periodoFim
      ? "Todas as datas (sem filtro de período)"
      : `De ${sumario.periodoInicio ? formatDateBR(sumario.periodoInicio) : "o início"} até ${sumario.periodoFim ? formatDateBR(sumario.periodoFim) : "hoje"}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white print:static print:overflow-visible">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-primary/10 bg-surface-soft px-4 py-3 print:hidden">
        <p className="text-sm text-ink-secondary">Pré-visualização do relatório — a impressão usa só o conteúdo abaixo.</p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary h-10" onClick={() => exportarXlsx(relatorio)}>
            <FileSpreadsheet size={16} />
            Exportar XLSX
          </button>
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

      <div id="relatorio-executivo" className="mx-auto max-w-4xl px-8 py-10 text-[#1F2417] print:px-0 print:py-0">
        <header className="flex items-center gap-4 border-b-[3px] border-[#006633] pb-4">
          <Image src="/logos/logo-morar-verde.png" alt="Morar" width={44} height={44} />
          <div>
            <h1 className="text-xl font-bold text-[#006633]">Relatório Gerencial de Atividades e Contatos</h1>
            <p className="text-xs text-[#5B6356]">Portal de Repasse — Morar Construtora e Incorporadora</p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-1 gap-1 text-sm sm:grid-cols-3">
          <p>
            <span className="font-semibold text-[#5B6356]">Data de emissão:</span> {emitidoEm}
          </p>
          <p>
            <span className="font-semibold text-[#5B6356]">Período analisado:</span> {periodo}
          </p>
          <p>
            <span className="font-semibold text-[#5B6356]">Colaborador responsável:</span> {sumario.colaboradorFiltro ?? "Todos"}
          </p>
        </section>

        <section className="mt-4">
          <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide text-[#006633]">Filtros aplicados</h2>
          {sumario.filtrosAplicados.length === 0 ? (
            <p className="text-sm text-[#5B6356]">Nenhum — todas as tarefas visíveis para você.</p>
          ) : (
            <ul className="list-inside list-disc text-sm text-[#5B6356]">
              {sumario.filtrosAplicados.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3 [break-inside:avoid]">
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#006633]">
              Total de contatos: {sumario.totalContatos}
            </h2>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#5B6356]">Por colaborador</p>
            <TabelaTotais dados={sumario.porColaborador} />
          </div>
          <div>
            <p className="mb-1 mt-7 text-xs font-semibold uppercase tracking-wide text-[#5B6356] sm:mt-[30px]">Por etapa</p>
            <TabelaTotais dados={sumario.porEtapa} />
          </div>
          <div>
            <p className="mb-1 mt-7 text-xs font-semibold uppercase tracking-wide text-[#5B6356] sm:mt-[30px]">Por imobiliária</p>
            <TabelaTotais dados={sumario.porImobiliaria} />
          </div>
        </section>

        {grupos.length === 0 ? (
          <p className="mt-8 text-sm text-[#5B6356]">Nenhum contato registrado no período e filtros selecionados.</p>
        ) : (
          grupos.map((grupo) => (
            <section key={grupo.etapa} className="mt-8">
              <h2 className="mb-2 border-b border-[#006633]/40 pb-1 text-sm font-bold text-[#006633] [break-after:avoid]">
                Etapa {grupo.etapa} <span className="font-normal text-[#5B6356]">· {grupo.totalContatos} contato(s)</span>
              </h2>
              {grupo.imobiliarias.map((g) => (
                <div key={g.imobiliaria} className="mb-4 [break-inside:avoid]">
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#5B6356] [break-after:avoid]">
                    {g.imobiliaria} · {g.contatos.length} contato(s)
                  </h3>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b-2 border-[#006633]/60 text-left text-[11px] uppercase text-[#5B6356] [break-inside:avoid]">
                        <th className="py-1.5 pr-2">Data/Hora</th>
                        <th className="py-1.5 pr-2">Colaborador</th>
                        <th className="py-1.5 pr-2">Cliente</th>
                        <th className="py-1.5">Resumo da ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.contatos.map((c, i) => (
                        <tr
                          key={i}
                          className={`align-top [break-inside:avoid] ${i % 2 === 1 ? "bg-[#F3F4F6]" : ""}`}
                        >
                          <td className="whitespace-nowrap py-1.5 pr-2 align-top">{formatDateTimeBR(c.dataHora)}</td>
                          <td className="py-1.5 pr-2 align-top">{c.colaborador}</td>
                          <td className="py-1.5 pr-2 align-top">
                            {c.clienteNome}
                            {c.cpfCnpj && <span className="text-[#5B6356]"> ({c.cpfCnpj})</span>}
                          </td>
                          <td className="py-1.5 align-top">{c.resumoAcao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          ))
        )}

        <footer className="mt-10 border-t border-[#1F2417]/10 pt-3 text-[10px] text-[#5B6356]">
          Portal de Repasse — Morar Construtora e Incorporadora. Documento gerado automaticamente a partir dos dados do painel.
        </footer>
      </div>
    </div>
  );
}

function TabelaTotais({ dados }: { dados: { chave: string; total: number }[] }) {
  if (dados.length === 0) return <p className="text-sm text-[#5B6356]">Nenhum contato registrado.</p>;
  return (
    <ul className="text-sm">
      {dados.map((d) => (
        <li key={d.chave} className="flex justify-between gap-2 border-b border-[#1F2417]/10 py-1">
          <span className="truncate">{d.chave}</span>
          <span className="shrink-0 tabular-nums font-semibold">{d.total}</span>
        </li>
      ))}
    </ul>
  );
}
