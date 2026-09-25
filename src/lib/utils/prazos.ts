import type { SlaStatus } from "@/lib/types";

const DIA_MS = 86_400_000;

function paraUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Hoje (yyyy-MM-dd) no fuso de Brasília — independe do fuso do servidor. */
export function hojeBrasilISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Soma dias úteis (seg-sex; feriados não são considerados) a uma data yyyy-MM-dd. */
export function adicionarDiasUteis(iso: string, dias: number): string {
  const d = paraUTC(iso);
  let restantes = dias;
  while (restantes > 0) {
    d.setTime(d.getTime() + DIA_MS);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) restantes--;
  }
  return paraISO(d);
}

/** Dias úteis de folga por urgência do SLA da etapa. */
const DIAS_UTEIS_POR_SLA: Record<SlaStatus, number> = {
  estourado: 1,
  urgente: 2,
  atencao: 3,
  no_prazo: 5,
};

/**
 * Prazo padrão de uma tarefa automática, definido na criação:
 *  - de linha: o menor entre o prazo da etapa (se ainda não venceu) e o
 *    limite por urgência do SLA (1 dia útil se estourado ... 5 se no prazo);
 *  - agregada: 2 dias úteis (gargalos) ou 5 (alinhamento de filtro de qualificação).
 */
export function calcularDataLimiteAutomatica(params: {
  base: string; // yyyy-MM-dd da importação
  slaStatus: SlaStatus;
  prazoEtapa: string | null;
  agregadoDiasUteis?: number; // presente => tarefa agregada
}): string {
  const { base, slaStatus, prazoEtapa, agregadoDiasUteis } = params;
  if (agregadoDiasUteis !== undefined) return adicionarDiasUteis(base, agregadoDiasUteis);

  const porSla = adicionarDiasUteis(base, DIAS_UTEIS_POR_SLA[slaStatus]);
  if (prazoEtapa && prazoEtapa >= base && prazoEtapa < porSla) return prazoEtapa;
  return porSla;
}
