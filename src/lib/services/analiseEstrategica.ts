import type { Registro } from "@/lib/types";
import { contemQualificacaoRuim } from "./taskRouter";

export interface MetricasEstrategicas {
  // % de pastas com apontamento/restrição de crédito ainda em aberto —
  // "vazamento" do funil de vendas por qualificação ruim do cliente.
  taxaVazamentoFunilPct: number;
  // % de pastas que já saíram da etapa 0.01 (inclusão inicial) — quanto
  // maior, mais eficiente a esteira em tirar pastas da inércia inicial.
  eficienciaInclusaoPct: number;
}

export function calcularMetricasEstrategicas(registros: Registro[]): MetricasEstrategicas {
  if (registros.length === 0) return { taxaVazamentoFunilPct: 0, eficienciaInclusaoPct: 0 };

  const comRestricao = registros.filter((r) => contemQualificacaoRuim(r.observacao)).length;
  const em001 = registros.filter((r) => r.etapa.trim().startsWith("0.01")).length;

  return {
    taxaVazamentoFunilPct: arredondar((comRestricao / registros.length) * 100),
    eficienciaInclusaoPct: arredondar(((registros.length - em001) / registros.length) * 100),
  };
}

function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}
