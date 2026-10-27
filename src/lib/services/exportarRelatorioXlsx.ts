import ExcelJS from "exceljs";
import { formatDateBR, formatDateTimeBR } from "@/lib/utils/dates";
import type { RelatorioPainel, SumarioRelatorioPainel, TotalPorChave } from "./relatorioPainel";

// Identidade visual Morar: verde escuro corporativo + cinza-claro para linhas de resumo/subtotal.
const VERDE_MORAR = "FF006633";
const CINZA_CLARO = "FFF3F4F6";
const BRANCO = "FFFFFFFF";
const BORDA_FINA: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD1D5DB" } },
  left: { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  right: { style: "thin", color: { argb: "FFD1D5DB" } },
};

function formatarPeriodo(sumario: SumarioRelatorioPainel): string {
  if (!sumario.periodoInicio && !sumario.periodoFim) return "Sem filtro de período (todas as datas)";
  const inicio = sumario.periodoInicio ? formatDateBR(sumario.periodoInicio) : "o início";
  const fim = sumario.periodoFim ? formatDateBR(sumario.periodoFim) : "hoje";
  return `De ${inicio} até ${fim}`;
}

function estilizarCabecalhoPrincipal(sheet: ExcelJS.Worksheet, linha: number, ultimaColuna: number) {
  const row = sheet.getRow(linha);
  row.height = 22;
  for (let col = 1; col <= ultimaColuna; col++) {
    const cell = row.getCell(col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_MORAR } };
    cell.font = { bold: true, color: { argb: BRANCO }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
    cell.border = BORDA_FINA;
  }
}

function estilizarLinhaSubtotal(sheet: ExcelJS.Worksheet, linha: number, ultimaColuna: number) {
  const row = sheet.getRow(linha);
  for (let col = 1; col <= ultimaColuna; col++) {
    const cell = row.getCell(col);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_CLARO } };
    cell.font = { bold: true };
    cell.border = BORDA_FINA;
  }
}

/** Uma tabela "chave | total" (colaborador/etapa/imobiliária) com cabeçalho verde e subtotal
 * cinza — devolve a próxima linha livre na planilha, pra encadear vários blocos em sequência. */
function escreverTabelaTotais(sheet: ExcelJS.Worksheet, linhaInicial: number, titulo: string, dados: TotalPorChave[]): number {
  let linha = linhaInicial;
  sheet.getCell(linha, 1).value = titulo;
  sheet.getCell(linha, 1).font = { bold: true, size: 12, color: { argb: VERDE_MORAR } };
  linha += 1;

  sheet.getCell(linha, 1).value = "Colaborador / Etapa / Imobiliária";
  sheet.getCell(linha, 2).value = "Total de contatos";
  estilizarCabecalhoPrincipal(sheet, linha, 2);
  linha += 1;

  if (dados.length === 0) {
    sheet.getCell(linha, 1).value = "Nenhum contato no período.";
    sheet.getCell(linha, 1).border = BORDA_FINA;
    sheet.getCell(linha, 2).border = BORDA_FINA;
    linha += 1;
  } else {
    for (const d of dados) {
      const row = sheet.getRow(linha);
      row.getCell(1).value = d.chave;
      row.getCell(1).alignment = { horizontal: "left" };
      row.getCell(2).value = d.total;
      row.getCell(2).alignment = { horizontal: "right" };
      row.getCell(1).border = BORDA_FINA;
      row.getCell(2).border = BORDA_FINA;
      linha += 1;
    }
    estilizarLinhaSubtotal(sheet, linha, 2);
    sheet.getCell(linha, 1).value = "Total geral";
    sheet.getCell(linha, 1).alignment = { horizontal: "left" };
    sheet.getCell(linha, 2).value = dados.reduce((s, d) => s + d.total, 0);
    sheet.getCell(linha, 2).alignment = { horizontal: "right" };
    linha += 1;
  }
  return linha + 1; // uma linha em branco antes do próximo bloco
}

function montarAbaSumario(wb: ExcelJS.Workbook, sumario: SumarioRelatorioPainel) {
  const sheet = wb.addWorksheet("Sumário Executivo", { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 36 }, { width: 20 }];

  sheet.mergeCells(1, 1, 1, 2);
  sheet.getCell(1, 1).value = "Relatório Gerencial de Atividades e Contatos";
  estilizarCabecalhoPrincipal(sheet, 1, 2);
  sheet.getRow(1).height = 26;
  sheet.getCell(1, 1).font = { bold: true, color: { argb: BRANCO }, size: 14 };

  let linha = 3;
  const metadados: [string, string][] = [
    ["Período analisado", formatarPeriodo(sumario)],
    ["Colaborador responsável", sumario.colaboradorFiltro ?? "Todos"],
    ["Filtros aplicados", sumario.filtrosAplicados.length ? sumario.filtrosAplicados.join("; ") : "Nenhum"],
    ["Total de contatos no período", String(sumario.totalContatos)],
  ];
  for (const [chave, valor] of metadados) {
    sheet.getCell(linha, 1).value = chave;
    sheet.getCell(linha, 1).font = { bold: true };
    sheet.getCell(linha, 2).value = valor;
    sheet.getCell(linha, 2).alignment = { horizontal: "left", wrapText: true };
    linha += 1;
  }
  linha += 1;

  linha = escreverTabelaTotais(sheet, linha, "Contatos por colaborador", sumario.porColaborador);
  linha = escreverTabelaTotais(sheet, linha, "Contatos por etapa", sumario.porEtapa);
  escreverTabelaTotais(sheet, linha, "Contatos por imobiliária", sumario.porImobiliaria);
}

function montarAbaDetalhamento(wb: ExcelJS.Workbook, relatorio: RelatorioPainel) {
  const sheet = wb.addWorksheet("Detalhamento de Ações", { views: [{ showGridLines: false }] });
  sheet.columns = [
    { header: "Etapa", width: 28 },
    { header: "Imobiliária", width: 26 },
    { header: "Cliente / CPF", width: 32 },
    { header: "Data e Hora", width: 18 },
    { header: "Colaborador", width: 20 },
    { header: "O que foi feito", width: 60 },
  ];
  estilizarCabecalhoPrincipal(sheet, 1, 6);

  let linha = 2;
  for (const grupo of relatorio.grupos) {
    for (const imob of grupo.imobiliarias) {
      for (const contato of imob.contatos) {
        const row = sheet.getRow(linha);
        row.getCell(1).value = grupo.etapa;
        row.getCell(2).value = imob.imobiliaria;
        row.getCell(3).value = contato.cpfCnpj ? `${contato.clienteNome} (${contato.cpfCnpj})` : contato.clienteNome;
        row.getCell(4).value = formatDateTimeBR(contato.dataHora);
        row.getCell(5).value = contato.colaborador;
        row.getCell(6).value = contato.resumoAcao;

        row.getCell(1).alignment = { horizontal: "left", vertical: "top", wrapText: true };
        row.getCell(2).alignment = { horizontal: "left", vertical: "top", wrapText: true };
        row.getCell(3).alignment = { horizontal: "left", vertical: "top", wrapText: true };
        row.getCell(4).alignment = { horizontal: "center", vertical: "top" };
        row.getCell(5).alignment = { horizontal: "left", vertical: "top" };
        row.getCell(6).alignment = { horizontal: "left", vertical: "top", wrapText: true };

        // Zebra striping suave nas linhas de dados, pra acompanhar a leitura sem distrair.
        const zebra = linha % 2 === 0;
        for (let col = 1; col <= 6; col++) {
          const cell = row.getCell(col);
          cell.border = BORDA_FINA;
          if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_CLARO } };
        }
        linha += 1;
      }
    }
  }

  if (linha === 2) {
    sheet.getCell(2, 1).value = "Nenhum contato registrado no período e filtros selecionados.";
    sheet.mergeCells(2, 1, 2, 6);
  }

  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
}

/**
 * Gera e baixa a planilha .xlsx do relatório, com acabamento executivo (cores corporativas Morar,
 * bordas, zebra striping, larguras ajustadas) — 100% client-side via ExcelJS. Nenhuma consulta ao
 * Firestore: `relatorio` já vem pronto, calculado em memória sobre as tarefas que o painel tinha
 * carregado (ver relatorioPainel.ts).
 */
export async function exportarRelatorioPainelXlsx(relatorio: RelatorioPainel, nomeArquivo = "relatorio-painel.xlsx") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portal de Repasse — Morar Construtora e Incorporadora";
  wb.created = new Date();

  montarAbaSumario(wb, relatorio.sumario);
  montarAbaDetalhamento(wb, relatorio);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}
