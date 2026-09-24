/**
 * Paleta categórica validada (ver skill dataviz — scripts/validate_palette.js).
 * Ordem fixa: nunca reordenar/ciclar as cores por índice de série diferente.
 * PASS em light (surface #FFFFFF) e dark (surface #12140F) para pares adjacentes.
 */
export const CATEGORICAL_LIGHT = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
] as const;

export const CATEGORICAL_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

// Slots com contraste < 3:1 no fundo claro (aqua, yellow, magenta): exigem rótulo
// direto visível ou tabela — nunca cor isolada. Ver dataviz/references/color-formula.md.
export const SLOTS_QUE_EXIGEM_RELIEF_LIGHT = new Set([2, 3, 4]);

export const CHART_CHROME_LIGHT = {
  surface: "#FFFFFF",
  gridline: "#E5E8E6",
  axis: "#C3C2B7",
  textPrimary: "#252B27",
  textSecondary: "#626A65",
  textMuted: "#7B837E",
};

export const CHART_CHROME_DARK = {
  surface: "#1B1E17",
  gridline: "#2c2c2a",
  axis: "#383835",
  textPrimary: "#FFFFFF",
  textSecondary: "#c3c2b7",
  textMuted: "#898781",
};

/** Sequencial de um hue só (azul), usado para magnitude de série única. */
export const SEQUENTIAL_BLUE = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
