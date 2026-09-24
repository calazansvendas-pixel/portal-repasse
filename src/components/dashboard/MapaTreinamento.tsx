"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/lib/theme/ThemeContext";
import { CATEGORICAL_LIGHT, CATEGORICAL_DARK, CHART_CHROME_LIGHT, CHART_CHROME_DARK } from "@/lib/dataviz/palette";
import type { CruzamentoPendencia } from "@/lib/services/analiseParceiros";
import { EmptyState } from "./EmptyState";

const MAX_TIPOS = 6;

export function MapaTreinamento({ cruzamento }: { cruzamento: CruzamentoPendencia[] }) {
  const { theme } = useTheme();
  const cores = theme === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  const chrome = theme === "dark" ? CHART_CHROME_DARK : CHART_CHROME_LIGHT;

  const { dados, tipos } = useMemo(() => pivotar(cruzamento), [cruzamento]);

  if (dados.length === 0) {
    return <EmptyState texto="Nenhuma pendência classificada ainda para montar o mapa de treinamento." />;
  }

  return (
    <div className="surface-card p-5">
      <h2 className="mb-1 text-base font-bold text-ink-primary dark:text-white">Mapa de Treinamento</h2>
      <p className="mb-4 text-xs text-ink-secondary dark:text-white/60">
        Imobiliária × tipo de pendência mais frequente, extraído do campo Observação.
      </p>
      <ResponsiveContainer width="100%" height={Math.max(260, dados.length * 46)}>
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={chrome.gridline} horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: chrome.textMuted, fontSize: 12 }}
            axisLine={{ stroke: chrome.axis }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="imobiliaria"
            tick={{ fill: chrome.textPrimary, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip
            contentStyle={{ background: chrome.surface, border: `1px solid ${chrome.gridline}`, borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: chrome.textSecondary }} />
          {tipos.map((tipo, i) => (
            <Bar
              key={tipo}
              dataKey={tipo}
              name={tipo}
              stackId="pendencias"
              fill={cores[i % cores.length]}
              radius={i === tipos.length - 1 ? [0, 4, 4, 0] : undefined}
              maxBarSize={22}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function pivotar(cruzamento: CruzamentoPendencia[]) {
  const totalPorTipo = new Map<string, number>();
  for (const c of cruzamento) totalPorTipo.set(c.tipoPendencia, (totalPorTipo.get(c.tipoPendencia) ?? 0) + c.total);

  const tipos = [...totalPorTipo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TIPOS)
    .map(([tipo]) => tipo);

  const porImobiliaria = new Map<string, Record<string, number>>();
  for (const c of cruzamento) {
    if (!tipos.includes(c.tipoPendencia)) continue;
    const linha = porImobiliaria.get(c.imobiliaria) ?? {};
    linha[c.tipoPendencia] = (linha[c.tipoPendencia] ?? 0) + c.total;
    porImobiliaria.set(c.imobiliaria, linha);
  }

  const dados = [...porImobiliaria.entries()]
    .map(([imobiliaria, valores]) => ({ imobiliaria, ...valores }))
    .sort((a, b) => somaValores(b) - somaValores(a));

  return { dados, tipos };
}

function somaValores(linha: Record<string, number | string>): number {
  return Object.entries(linha)
    .filter(([chave]) => chave !== "imobiliaria")
    .reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);
}
