import type { Firestore } from "firebase-admin/firestore";
import type { LinhaPlanilha } from "./parseSheet";
import type { CategoriaGatilho, RegraAuditoria } from "@/lib/types/regrasAuditoria";

/**
 * Avaliador Dinâmico do Motor de Regras (No-Code) — ESQUELETO.
 *
 * `executarAuditoriaDiaria` (auditEngine.ts) já chama `buscarRegrasAtivas` a cada importação e
 * repassa o resultado para `avaliarRegrasDinamicas`, mas cada categoria abaixo ainda não gera
 * nem fecha tarefa nenhuma — é só o encaixe pronto para a próxima etapa (uma função por
 * categoria, lendo `regra.parametros` e devolvendo os specs de tarefa a reconciliar, no mesmo
 * formato que `taskRouter.ts` já usa para as regras fixas).
 *
 * Nada aqui, hoje, altera o comportamento das importações: o retorno é sempre `[]`.
 */

/** Uma linha da planilha (ou uma pasta já em base) que bateu com uma regra dinâmica. */
export interface EspecTarefaDinamica {
  regraId: string;
  numero: string;
  tipoPendencia: string;
  descricao: string;
}

/** Lê só as regras com `ativo === true` — as desligadas não custam nenhum processamento. */
export async function buscarRegrasAtivas(db: Firestore): Promise<RegraAuditoria[]> {
  const snap = await db.collection("regras_auditoria").where("ativo", "==", true).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegraAuditoria);
}

/**
 * Roteador por categoria: para cada regra ativa, chama o avaliador correspondente. Devolve a
 * lista combinada de specs de tarefa que as regras dinâmicas geraram para esta importação.
 */
export function avaliarRegrasDinamicas(regras: RegraAuditoria[], linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  const especs: EspecTarefaDinamica[] = [];
  for (const regra of regras) {
    especs.push(...avaliarRegra(regra, linhas));
  }
  return especs;
}

function avaliarRegra(regra: RegraAuditoria, linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  const categoria: CategoriaGatilho = regra.categoriaGatilho;
  switch (categoria) {
    case "sla_estagnacao":
      return avaliarSlaEstagnacao(regra, linhas);
    case "volume_gargalo":
      return avaliarVolumeGargalo(regra, linhas);
    case "analise_textual":
      return avaliarAnaliseTextual(regra, linhas);
    case "regressao":
      return avaliarRegressao(regra, linhas);
    case "ociosidade_imobiliaria":
      return avaliarOciosidadeImobiliaria(regra, linhas);
    case "qualidade_reprovacao":
      return avaliarQualidadeReprovacao(regra, linhas);
    case "conformidade":
      return avaliarConformidade(regra, linhas);
    case "acoes_positivas":
      return avaliarAcoesPositivas(regra, linhas);
    case "sla_interno":
      // Esta categoria não olha a planilha — olha as próprias tarefas do sistema (tempo aberta).
      // Precisa ser avaliada em outro ponto do motor (tem acesso a tarefas, não a `linhas`).
      return [];
    default: {
      // Exhaustividade: se uma categoria nova entrar em CategoriaGatilho sem um case aqui, o
      // TypeScript aponta o erro nesta linha.
      const _exaustivo: never = categoria;
      return _exaustivo;
    }
  }
}

// ---------------------------------------------------------------------------
// Um avaliador por categoria — todos ainda vazios (ver cabeçalho do arquivo).
// ---------------------------------------------------------------------------

function avaliarSlaEstagnacao(_regra: RegraAuditoria, _linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  // TODO: usar regra.parametros.etapa + regra.parametros.dias contra o histórico de cada pasta.
  return [];
}

function avaliarVolumeGargalo(_regra: RegraAuditoria, _linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  // TODO: agrupar `linhas` por regra.parametros.dimensao (etapa/imobiliaria/produto) e comparar
  // a contagem com regra.parametros.quantidade.
  return [];
}

function avaliarAnaliseTextual(_regra: RegraAuditoria, _linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  // TODO: normalize(linha.observacao).includes(normalize(regra.parametros.palavraChave)).
  return [];
}

function avaliarRegressao(_regra: RegraAuditoria, _linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  // TODO: comparar a etapa atual com o histórico salvo em `registros` e detectar retrocesso.
  return [];
}

function avaliarOciosidadeImobiliaria(_regra: RegraAuditoria, _linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  // TODO: por imobiliária, olhar a data da última pasta recebida DESDE que ela existe neste
  // sistema (nunca importar/inferir histórico de uma base antiga) e comparar com
  // regra.parametros.dias.
  return [];
}

function avaliarQualidadeReprovacao(_regra: RegraAuditoria, _linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  // TODO: contar pastas reprovadas (critério a definir) contra regra.parametros.quantidade.
  return [];
}

function avaliarConformidade(_regra: RegraAuditoria, _linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  // TODO: regra.parametros.subtipoConformidade === "duplicidade" | "vencimento_longo".
  return [];
}

function avaliarAcoesPositivas(_regra: RegraAuditoria, _linhas: LinhaPlanilha[]): EspecTarefaDinamica[] {
  // TODO: meta de sucesso / velocidade de aprovação acima do esperado (reconhecimento, não pendência).
  return [];
}
