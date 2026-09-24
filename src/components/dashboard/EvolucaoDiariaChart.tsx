"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { useTheme } from "@/lib/theme/ThemeContext";
import { CATEGORICAL_LIGHT, CATEGORICAL_DARK, CHART_CHROME_LIGHT, CHART_CHROME_DARK } from "@/lib/dataviz/palette";
import { formatDateBR } from "@/lib/utils/dates";
import type { EvolucaoEtapas } from "@/lib/services/analiseEtapas";
import { EmptyState } from "./EmptyState";

export function EvolucaoDiariaChart({ dados }: { dados: EvolucaoEtapas }) {
  const { theme } = useTheme();
  const cores = theme === "dark" ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  const chrome = theme === "dark" ? CHART_CHROME_DARK : CHART_CHROME_LIGHT;

  if (dados.datas.length === 0) {
    return <EmptyState texto="Ainda não há dias suficientes importados para montar a evolução." />;
  }

  return (
    <div className="surface-card p-5">
      <h2 className="mb-1 text-base font-bold text-ink-primary dark:text-white">Evolução Diária</h2>
      <p className="mb-4 text-xs text-ink-secondary dark:text-white/60">
        Tempo médio (dias) de permanência em cada etapa, por dia de importação.
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={dados.pontos} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={chrome.gridline} vertical={false} />
          <XAxis
            dataKey="data"
            tickFormatter={(v: string) => formatDateBR(v)}
            tick={{ fill: chrome.textMuted, fontSize: 12 }}
            axisLine={{ stroke: chrome.axis }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: chrome.textMuted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={32}
            label={{ value: "dias", angle: -90, position: "insideLeft", fill: chrome.textMuted, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: chrome.surface, border: `1px solid ${chrome.gridline}`, borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v: string) => formatDateBR(v)}
            labelStyle={{ color: chrome.textPrimary, fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: chrome.textSecondary }} />
          {dados.etapas.map((etapa, i) => (
            <Line
              key={etapa}
              type="monotone"
              dataKey={etapa}
              name={`Etapa ${etapa}`}
              stroke={cores[i % cores.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
