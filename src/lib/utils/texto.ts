/**
 * "Fatia" o texto livre de uma observação em itens de checklist. A planilha
 * usa separadores variados (quebra de linha, "1-", "2-", " - " entre itens)
 * — aqui normalizamos tudo para uma lista, para o card renderizar como
 * checklist em vez de um bloco de texto único.
 */
export function fatiarObservacao(texto: string): string[] {
  const normalizado = texto.replace(/\r\n?/g, "\n").trim();
  if (!normalizado) return [];

  const partes = normalizado
    .split(/\n+|(?:^|\s)\d{1,2}[-.)]\s+|\s+-\s+/g)
    .map((parte) => parte.trim())
    .filter(Boolean);

  return partes.length > 0 ? partes : [normalizado];
}
