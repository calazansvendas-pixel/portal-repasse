import * as XLSX from "xlsx";
import { excelCellToISODate } from "@/lib/utils/dates";
import { normalize } from "@/lib/auth/roles";

export interface LinhaPlanilha {
  numero: string;
  cpfCnpj: string;
  cidade: string;
  responsavel: string;
  etapa: string;
  prazoEtapa: string | null;
  observacao: string;
  clienteNome: string;
  dataEntrada: string | null;
}

export interface ResultadoParse {
  sheetName: string;
  linhas: LinhaPlanilha[];
  colunasNaoEncontradas: string[];
}

type ColunaChave = keyof LinhaPlanilha;

// Testado em ordem: a primeira condição que bater vence. Colunas de prazo/etapa
// precisam ser checadas antes de "etapa" pura, pois "Prazo da etapa" contém "etapa".
const MATCHERS: { chave: ColunaChave; teste: (h: string) => boolean }[] = [
  { chave: "numero", teste: (h) => h === "numero" || h.startsWith("numero") },
  { chave: "cpfCnpj", teste: (h) => h.includes("cpf") },
  { chave: "cidade", teste: (h) => h.includes("cidade") },
  { chave: "responsavel", teste: (h) => h.includes("responsav") },
  { chave: "prazoEtapa", teste: (h) => h.includes("prazo") && h.includes("etapa") },
  { chave: "etapa", teste: (h) => h.includes("etapa") && h.includes("processo") },
  { chave: "observacao", teste: (h) => h.includes("observ") },
  { chave: "clienteNome", teste: (h) => h.includes("proponente") },
  { chave: "dataEntrada", teste: (h) => h.includes("data") && (h.includes("inclus") || h.includes("venda")) },
];

const NOME_COLUNA: Record<ColunaChave, string> = {
  numero: "Número",
  cpfCnpj: "CPF / CNPJ (1º Prop)",
  cidade: "Cidade do empreendimento",
  responsavel: "Responsáveis pela pasta",
  etapa: "Etapa do processo",
  prazoEtapa: "Prazo da etapa",
  observacao: "Observação",
  clienteNome: "1º Proponente",
  dataEntrada: "Data Inclusão / Data da venda",
};

/** Escolhe a aba a processar: prioriza nomes no padrão "0.01 dd-MM", senão usa a primeira aba. */
function escolherAba(workbook: XLSX.WorkBook): string {
  const preferida = workbook.SheetNames.find((nome) => /^0\.0?1/.test(nome.trim()));
  return preferida ?? workbook.SheetNames[0];
}

/** Procura, dentre as primeiras linhas, a que contém os cabeçalhos esperados. */
function localizarLinhaCabecalho(matriz: unknown[][]): number {
  const limite = Math.min(matriz.length, 15);
  for (let i = 0; i < limite; i++) {
    const linha = matriz[i] ?? [];
    const normalizados = linha.map((c) => normalize(String(c ?? "")));
    const bateNumero = normalizados.some((h) => h === "numero" || h.startsWith("numero"));
    const bateCidade = normalizados.some((h) => h.includes("cidade"));
    if (bateNumero && bateCidade) return i;
  }
  return 0;
}

export function parseWorkbookBuffer(buffer: ArrayBuffer | Buffer): ResultadoParse {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = escolherAba(workbook);
  const sheet = workbook.Sheets[sheetName];
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  const linhaCabecalho = localizarLinhaCabecalho(matriz);
  const cabecalho = (matriz[linhaCabecalho] ?? []).map((c) => normalize(String(c ?? "")));

  const indicePorColuna = {} as Record<ColunaChave, number>;
  for (const { chave, teste } of MATCHERS) {
    const idx = cabecalho.findIndex((h) => h && teste(h));
    if (idx >= 0) indicePorColuna[chave] = idx;
  }

  const colunasNaoEncontradas = (Object.keys(NOME_COLUNA) as ColunaChave[])
    .filter((chave) => !(chave in indicePorColuna))
    .map((chave) => NOME_COLUNA[chave]);

  const linhas: LinhaPlanilha[] = [];
  for (let i = linhaCabecalho + 1; i < matriz.length; i++) {
    const linha = matriz[i];
    if (!linha || linha.every((c) => c === null || c === undefined || c === "")) continue;

    const numero = celulaParaTexto(linha[indicePorColuna.numero]);
    if (!numero) continue; // sem chave primária, ignora a linha

    linhas.push({
      numero,
      cpfCnpj: celulaParaTexto(linha[indicePorColuna.cpfCnpj]),
      cidade: celulaParaTexto(linha[indicePorColuna.cidade]),
      responsavel: celulaParaTexto(linha[indicePorColuna.responsavel]),
      etapa: celulaParaTexto(linha[indicePorColuna.etapa]),
      prazoEtapa: excelCellToISODate(linha[indicePorColuna.prazoEtapa]),
      observacao: celulaParaTexto(linha[indicePorColuna.observacao]),
      clienteNome: celulaParaTexto(linha[indicePorColuna.clienteNome]),
      dataEntrada: excelCellToISODate(linha[indicePorColuna.dataEntrada]),
    });
  }

  return { sheetName, linhas, colunasNaoEncontradas };
}

function celulaParaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}
