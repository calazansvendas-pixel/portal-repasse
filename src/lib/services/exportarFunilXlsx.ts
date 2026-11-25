import ExcelJS from "exceljs";
import type { Funil } from "@/lib/utils/funilDestinos";

const VERDE_MORAR = "FF006B3F";
const CINZA_CLARO = "FFF3F4F6";
const BORDA: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E8E6" } },
  left: { style: "thin", color: { argb: "FFE5E8E6" } },
  bottom: { style: "thin", color: { argb: "FFE5E8E6" } },
  right: { style: "thin", color: { argb: "FFE5E8E6" } },
};

export interface ClienteDoRecorte {
  cliente: string;
  cpfCnpj: string;
  empreendimento: string;
  etapaAtual: string;
  movimentacao: string;
  /** yyyy-MM-dd da movimentação. */
  data: string | null;
}

function linhaTabela(sheet: ExcelJS.Worksheet, valores: ExcelJS.CellValue[], estilo: "cabecalho" | "total" | "dado") {
  const row = sheet.addRow(valores);
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = BORDA;
    cell.alignment = { vertical: "top", wrapText: true };
    if (estilo === "cabecalho") {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_MORAR } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    }
    if (estilo === "total") {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA_CLARO } };
      cell.font = { bold: true };
    }
  });
  return row;
}

export async function montarPlanilhaFunil(funil: Funil, filtros: [string, string][], clientes: ClienteDoRecorte[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Portal de Repasse — Morar Construtora e Incorporadora";
  wb.created = new Date();

  const resumo = wb.addWorksheet("Resumo por Etapa", { views: [{ showGridLines: false }] });
  resumo.columns = [{ width: 46 }, { width: 46 }, { width: 16 }, { width: 10 }];
  const titulo = resumo.addRow(["Resumo de Movimentação e Conversão"]);
  titulo.font = { bold: true, size: 14, color: { argb: VERDE_MORAR } };
  resumo.addRow([]);
  for (const [rotulo, valor] of filtros) {
    const row = resumo.addRow([rotulo, valor]);
    row.getCell(1).font = { bold: true };
  }
  resumo.addRow([]);
  linhaTabela(resumo, ["Origem", "Destino", "Qtd. de clientes", "%"], "cabecalho");
  for (const g of funil.grupos) {
    const row = linhaTabela(resumo, [g.origem, g.destino, g.clientes, g.percentual / 100], "dado");
    row.getCell(4).numFmt = "0.0%";
  }
  linhaTabela(resumo, ["Total de clientes no recorte", "", funil.totalClientes, ""], "total");
  for (const nota of funil.notas) resumo.addRow([nota]).font = { italic: true, size: 9 };

  const lista = wb.addWorksheet("Clientes Filtrados", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  lista.columns = [{ width: 40 }, { width: 20 }, { width: 28 }, { width: 38 }, { width: 38 }, { width: 13 }];
  linhaTabela(lista, ["Cliente", "CPF/CNPJ", "Empreendimento", "Etapa Atual", "Movimentação", "Data"], "cabecalho");
  for (const c of clientes) {
    const row = linhaTabela(
      lista,
      [c.cliente, c.cpfCnpj, c.empreendimento, c.etapaAtual, c.movimentacao, c.data ? new Date(`${c.data}T00:00:00Z`) : ""],
      "dado"
    );
    row.getCell(6).numFmt = "dd/mm/yyyy";
  }
  lista.autoFilter = { from: { row: 1, column: 1 }, to: { row: clientes.length + 1, column: 6 } };

  return wb;
}

/** Gera e baixa a planilha no navegador, com o que já está em memória (nenhuma consulta). */
export async function exportarFunilXlsx(funil: Funil, filtros: [string, string][], clientes: ClienteDoRecorte[], nomeArquivo: string) {
  const wb = await montarPlanilhaFunil(funil, filtros, clientes);
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}
