// Critério compartilhado por limpar-tarefas-duplicadas.mjs e desativar-regras-clonadas.mjs.
//
// Regra "clonada" = mesma etapa, mesmo gatilho, mesmos demais parâmetros, mesmo destino e mesmo texto
// de card que outra regra ATIVA, diferindo só no nome ("... (Cópia)") e/ou no prazo (`dias`).
// A ORIGINAL de cada grupo é a de menor `dias` (desempate: a mais antiga, depois o id).

export const normalize = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export const diasDaRegra = (r) => (Number.isFinite(r.parametros?.dias) ? r.parametros.dias : 0);

/** Tudo que define O QUE a regra dispara e PARA QUEM, exceto o nome e o prazo em dias. */
export function assinaturaSemDias(r) {
  const { dias: _dias, ...demaisParametros } = r.parametros ?? {};
  return JSON.stringify([
    r.categoriaGatilho,
    demaisParametros,
    r.destinoTipo ?? "cargo",
    r.cargoDestino,
    r.pessoaId ?? null,
    r.filtroPraca ?? null,
    normalize(r.textoTarefa),
  ]);
}

const porIdade = (a, b) =>
  Number(b.ativo !== false) - Number(a.ativo !== false) ||
  diasDaRegra(a) - diasDaRegra(b) ||
  String(a.criadoEm ?? "").localeCompare(String(b.criadoEm ?? "")) ||
  a.id.localeCompare(b.id);

/** Agrupa as regras por assinatura; cada grupo vem ordenado com a ORIGINAL na frente (ativas antes
 * das inativas, depois menor prazo). Por padrão só as ativas; `incluirInativas` serve para ligar
 * cards antigos à regra que já foi desativada. */
export function agruparRegras(regras, { incluirInativas = false } = {}) {
  const grupos = new Map();
  for (const r of regras.filter((x) => incluirInativas || x.ativo !== false)) {
    const a = assinaturaSemDias(r);
    grupos.set(a, [...(grupos.get(a) ?? []), r]);
  }
  for (const lista of grupos.values()) lista.sort(porIdade);
  return grupos;
}
