"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/lib/theme/ThemeContext";
import { CHART_CHROME_LIGHT, CHART_CHROME_DARK } from "@/lib/dataviz/palette";
import type { EvolucaoEtapas } from "@/lib/services/analiseEtapas";
import { EmptyState } from "./EmptyState";

// Sequencial de um hue (azul), do mais claro (etapa tranquila) ao mais escuro
// (maior tempo de permanência = maior gargalo).
const RAMPA_AZUL_LIGHT = ["#cde2fb", "#9ec5f4", "#5598e7", "#2a78d6", "#184f95"];
const RAMPA_AZUL_DARK = ["#86b6ef", "#5598e7", "#3987e5", "#1c5cab", "#104281"];

export function GargalosChart({ dados }: { dados: EvolucaoEtapas }) {
  const { theme } = useTheme();
  const chrome = theme === "dark" ? CHART_CHROME_DARK : CHART_CHROME_LIGHT;
  const rampa = theme === "dark" ? RAMPA_AZUL_DARK : RAMPA_AZUL_LIGHT;

  if (dados.gargalos.length === 0) {
    return <EmptyState texto="Sem dados suficientes para identificar gargalos ainda." />;
  }

  const max = Math.max(...dados.gargalos.map((g) => g.diasMedios));

  return (
    <div className="surface-card p-5">
      <h2 className="mb-1 text-base font-bold text-ink-primary dark:text-white">Gargalos (Bottleneck)</h2>
      <p className="mb-4 text-xs text-ink-secondary dark:text-white/60">
        Tempo médio (dias) de permanência na etapa atual — a mais recente importação.
      </p>
      <ResponsiveContainer width="100%" height={Math.max(240, dados.gargalos.length * 42)}>
        <BarChart data={dados.gargalos} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }} barCategoryGap={10}>
          <CartesianGrid stroke={chrome.gridline} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: chrome.textMuted, fontSize: 12 }}
            axisLine={{ stroke: chrome.axis }}
            tickLine={false}
            label={{ value: "dias", position: "insideBottom", offset: -2, fill: chrome.textMuted, fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="etapa"
            tick={{ fill: chrome.textPrimary, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={72}
            tickFormatter={(v: string) => `Etapa ${v}`}
          />
          <Tooltip
            contentStyle={{ background: chrome.surface, border: `1px solid ${chrome.gridline}`, borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [`${v} dias`, "Permanência média"]}
            labelFormatter={(v: string) => `Etapa ${v}`}
          />
          <Bar dataKey="diasMedios" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {dados.gargalos.map((g, i) => {
              const intensidade = Math.min(rampa.length - 1, Math.round((g.diasMedios / max) * (rampa.length - 1)));
              return <Cell key={g.etapa} fill={rampa[intensidade]} data-index={i} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
