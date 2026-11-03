/**
 * Régua progressiva: várias regras podem disparar, ao longo dos dias, para a mesma pasta, na mesma
 * etapa e para o MESMO destino (ex.: a regra "5.04" com 0 dia e a sua "(Cópia)" com 2 dias, ambas
 * da Analista). Em vez de abrir um card por regra, o primeiro card é reaproveitado: o novo gatilho
 * é registrado nele e o card sobe de novo na coluna. Só um destino DIFERENTE (a régua escalando da
 * Analista para o Coordenador ou a Gerência) abre um card paralelo.
 *
 * Sem imports de propósito: lógica pura, testável com `node scripts/testar-reaproveitamento-card.mjs`.
 */

export interface GatilhoRegistrado {
  chaveRegra: string;
  regraId: string | null;
  /** Prazo (`dias`) da regra que disparou, quando ela tem um — o "dias de estagnação" do gatilho. */
  dias: number | null;
  descricao: string;
  /** ISO do momento em que o gatilho foi registrado. */
  data: string;
}

/** O mínimo de uma tarefa/dados de reconciliação necessário para decidir o reaproveitamento. */
export interface AlvoReaproveitamento {
  origem: string;
  numero: string | null;
  etapa: string;
  /** Quadro de destino (coluna). */
  quadro: string;
  responsavelId?: string | null;
  responsavelNome?: string | null;
}

const semAcento = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** "5.04 - Emissão de contratos" -> "5.04" (mesmo critério de codigoEtapa em roles.ts). */
function codigoDaEtapa(etapa: string): string {
  const valor = etapa.trim();
  return valor.split(" - ")[0]?.trim() || valor;
}

/**
 * Chave "esta pasta, nesta etapa, para este destino". null = não reaproveita (tarefa agregada ou
 * sem pasta: o agrupamento delas já é por imobiliária/etapa, não por pasta).
 */
export function chaveDeReaproveitamento(t: AlvoReaproveitamento): string | null {
  if (t.origem !== "linha" || !t.numero) return null;
  const pessoa = t.responsavelId || semAcento(t.responsavelNome ?? "");
  return [t.numero, codigoDaEtapa(t.etapa), t.quadro, pessoa].join("|");
}

/** Acrescenta o gatilho, sem repetir um que já esteja registrado (a importação roda todo dia). */
export function registrarGatilho(
  atuais: GatilhoRegistrado[] | null | undefined,
  novo: GatilhoRegistrado
): { gatilhos: GatilhoRegistrado[]; novoRegistro: boolean } {
  const lista = atuais ?? [];
  if (lista.some((g) => g.chaveRegra === novo.chaveRegra)) return { gatilhos: lista, novoRegistro: false };
  return { gatilhos: [...lista, novo], novoRegistro: true };
}
