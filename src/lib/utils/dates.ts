import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Converte um valor de célula do Excel (número serial, string ou Date) para ISO (yyyy-MM-dd). */
export function excelCellToISODate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return toISODateOnly(value);
  }

  if (typeof value === "number") {
    // Excel serial date: dias desde 1899-12-30.
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = value * 86_400_000;
    return toISODateOnly(new Date(epoch.getTime() + ms));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    // dd/MM/yyyy ou dd-MM-yyyy
    const brMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (brMatch) {
      const [, d, m, y] = brMatch;
      const year = y.length === 2 ? Number(`20${y}`) : Number(y);
      const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
      return toISODateOnly(date);
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return toISODateOnly(parsed);
  }

  return null;
}

function toISODateOnly(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatDateBR(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  try {
    return format(parseISO(isoDate), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
}

export function formatDateTimeBR(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return "—";
  try {
    return format(parseISO(isoDateTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return "—";
  }
}

export function hojeISO(): string {
  return toISODateOnly(new Date());
}

/** Dias corridos entre uma data ISO e hoje (>= 0). Retorna null se a data for inválida. */
export function diasDesde(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  try {
    const inicio = parseISO(isoDate);
    if (Number.isNaN(inicio.getTime())) return null;
    const ms = Date.now() - inicio.getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  } catch {
    return null;
  }
}

/** yyyy-MM-dd que existe no calendário (recusa 2026-02-31, 2026-04-31 etc.; aceita 29/02 só em ano bissexto). */
export function dataDeCalendarioValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}
