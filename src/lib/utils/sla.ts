import type { SlaStatus } from "@/lib/types";

/**
 * Classifica o SLA a partir do "Prazo da etapa".
 * - estourado: prazo já passou
 * - urgente: vence hoje ou amanhã
 * - atencao: vence em até 3 dias
 * - no_prazo: qualquer outro caso (ou sem prazo definido)
 */
export function calcularSlaStatus(prazoEtapaISO: string | null, hoje = new Date()): SlaStatus {
  if (!prazoEtapaISO) return "no_prazo";
  const prazo = new Date(prazoEtapaISO);
  if (Number.isNaN(prazo.getTime())) return "no_prazo";

  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const inicioPrazo = new Date(prazo.getFullYear(), prazo.getMonth(), prazo.getDate());
  const diffDias = Math.round((inicioPrazo.getTime() - inicioHoje.getTime()) / 86_400_000);

  if (diffDias < 0) return "estourado";
  if (diffDias <= 1) return "urgente";
  if (diffDias <= 3) return "atencao";
  return "no_prazo";
}

export const SLA_LABEL: Record<SlaStatus, string> = {
  no_prazo: "No prazo",
  atencao: "Atenção",
  urgente: "Urgente",
  estourado: "Estourado",
};

/** Classes Tailwind de cor por status de SLA, seguindo o design system MORAR. */
export const SLA_BADGE_CLASSES: Record<SlaStatus, string> = {
  no_prazo: "bg-status-success/10 text-status-success border border-status-success/30",
  atencao: "bg-status-warning/10 text-status-warning border border-status-warning/30",
  urgente: "bg-status-danger/10 text-status-danger border border-status-danger/30",
  estourado: "bg-status-danger/15 text-status-danger border border-status-danger/40",
};
