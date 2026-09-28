import type { Firestore } from "firebase-admin/firestore";
import { normalize, resolvePracaPorCidade } from "@/lib/auth/roles";
import type { LinhaPlanilha } from "./parseSheet";
import type { EtapaHistorico, Quadro, Registro } from "@/lib/types";
import type { RegraAuditoria } from "@/lib/types/regrasAuditoria";

/**
 * Avaliador Dinâmico do Motor de Regras (No-Code).
 *
 * Fase 2: as categorias "SLA e Estagnação", "Volume e Gargalos" e "Ociosidade de Imobiliária"
 * já geram tarefas de verdade. As outras 6 categorias continuam como esqueleto (retornam
 * sempre `[]`) até serem implementadas — ver `avaliarRegraAgregadaPendente` no fim do arquivo.
 *
 * Limitação conhecida desta fase: uma regra com `cargoDestino: "gerencia"` nunca gera tarefa —
 * o painel não tem quadro/coluna para a Gerência (ela só observa em modo "God Mode"). Uma regra
 * de "assistente" em categoria agregada (Volume/Ociosidade) também não gera tarefa, porque o
 * agrupamento (por imobiliária, etapa ou produto) não aponta uma única praça de forma confiável.
 */

/** Uma ocorrência de regra dinâmica pronta para virar (ou fechar) uma tarefa. */
export interface AvaliacaoDinamica {
  chaveRegra: string; // `DINAMICA::${regra.id}::${identificador}` — estável entre importações
  origem: "linha" | "agregado";
  quadro: Quadro;
  numerosRelacionados: string[] | null;
  imobiliaria: string;
  etapa: string;
  tipoPendencia: string;
  descricao: string;
  condicaoAtiva: boolean;
}

/** Lê só as regras com `ativo === true` — as desligadas não custam nenhum processamento. */
export async function buscarRegrasAtivas(db: Firestore): Promise<RegraAuditoria[]> {
  const snap = await db.collection("regras_auditoria").where("ativo", "==", true).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RegraAuditoria);
}

/** Troca {variavel} pelo valor correspondente no texto configurado pela Gerência. */
function substituirVariaveis(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (match, chave: string) => valores[chave] ?? match);
}

/** Quantos dias consecutivos (importações seguidas) a pasta já aparece na mesma etapa. */
function diasConsecutivosNaEtapa(historico: EtapaHistorico[], etapaAtual: string): number {
  let dias = 0;
  for (let i = historico.length - 1; i >= 0; i--) {
    if (historico[i].etapa.trim() !== etapaAtual.trim()) break;
    dias++;
  }
  return dias;
}

/** cargoDestino -> Quadro só quando dá para rotear com confiança para uma única coluna do painel. */
function quadroParaLinha(regra: RegraAuditoria, cidade: string): Quadro | null {
  if (regra.cargoDestino === "assistente") return resolvePracaPorCidade(cidade);
  if (regra.cargoDestino === "coordenador" || regra.cargoDestino === "analista") return regra.cargoDestino;
  return null; // "gerencia": sem quadro próprio no painel.
}

function quadroParaAgregado(regra: RegraAuditoria): Quadro | null {
  if (regra.cargoDestino === "coordenador" || regra.cargoDestino === "analista") return regra.cargoDestino;
  return null; // "assistente"/"gerencia": agregado não aponta uma única praça com segurança.
}

// ---------------------------------------------------------------------------
// SLA e Estagnação — avaliada por LINHA, dentro do laço principal da importação
// (precisa do histórico do dia já calculado para aquela pasta).
// ---------------------------------------------------------------------------

export function avaliarSlaEstagnacaoParaLinha(
  regras: RegraAuditoria[],
  linha: LinhaPlanilha,
  historicoPasta: EtapaHistorico[]
): AvaliacaoDinamica[] {
  const especs: AvaliacaoDinamica[] = [];
  for (const regra of regras) {
    if (regra.categoriaGatilho !== "sla_estagnacao") continue;
    const quadro = quadroParaLinha(regra, linha.cidade);
    if (!quadro) continue;

    const etapaAlvo = regra.parametros.etapa?.trim();
    const diasLimite = regra.parametros.dias ?? 0;
    if (!diasLimite) continue; // regra mal configurada (sem dias): nunca dispara, não trava a importação
    if (etapaAlvo && linha.etapa.trim() !== etapaAlvo) continue;

    const diasParada = diasConsecutivosNaEtapa(historicoPasta, linha.etapa);
    especs.push({
      chaveRegra: `DINAMICA::${regra.id}::${linha.numero}`,
      origem: "linha",
      quadro,
      numerosRelacionados: null,
      imobiliaria: linha.responsavel,
      etapa: linha.etapa,
      tipoPendencia: regra.nomeRegra,
      descricao: substituirVariaveis(regra.textoTarefa, {
        cliente: linha.clienteNome || "cliente não identificado",
        imobiliaria: linha.responsavel || "imobiliária não informada",
        etapa: linha.etapa,
        dias: String(diasParada),
      }),
      condicaoAtiva: diasParada >= diasLimite,
    });
  }
  return especs;
}

// ---------------------------------------------------------------------------
// Volume e Gargalos + Ociosidade de Imobiliária — avaliadas em bloco, depois do
// laço principal (cruzam todas as linhas da importação de uma vez).
// ---------------------------------------------------------------------------

export function avaliarRegrasAgregadasDinamicas(
  regras: RegraAuditoria[],
  linhas: LinhaPlanilha[],
  registrosAntigos: Map<string, Registro>,
  importacaoId: string
): AvaliacaoDinamica[] {
  const especs: AvaliacaoDinamica[] = [];
  for (const regra of regras) {
    if (regra.categoriaGatilho === "volume_gargalo") {
      especs.push(...avaliarVolumeGargalo(regra, linhas));
    } else if (regra.categoriaGatilho === "ociosidade_imobiliaria") {
      especs.push(...avaliarOciosidadeImobiliaria(regra, linhas, registrosAntigos, importacaoId));
    }
    // demais categorias agregadas: ver avaliarRegraAgregadaPendente (ainda não implementadas).
  }
  return especs;
}

function avaliarVolumeGargalo(regra: RegraAuditoria, linhas: LinhaPlanilha[]): AvaliacaoDinamica[] {
  const quadro = quadroParaAgregado(regra);
  const limite = regra.parametros.quantidade ?? 0;
  if (!quadro || !limite) return [];
  const dimensao = regra.parametros.dimensao ?? "etapa";

  const grupos = new Map<string, LinhaPlanilha[]>();
  for (const linha of linhas) {
    const valor = dimensao === "etapa" ? linha.etapa : dimensao === "imobiliaria" ? linha.responsavel : linha.produto;
    const chave = valor?.trim();
    if (!chave) continue;
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha]);
  }

  const especs: AvaliacaoDinamica[] = [];
  for (const [valor, grupo] of grupos) {
    especs.push({
      chaveRegra: `DINAMICA::${regra.id}::${normalize(valor)}`,
      origem: "agregado",
      quadro,
      numerosRelacionados: grupo.map((l) => l.numero),
      imobiliaria: dimensao === "imobiliaria" ? valor : "",
      etapa: dimensao === "etapa" ? valor : "",
      tipoPendencia: regra.nomeRegra,
      descricao: substituirVariaveis(regra.textoTarefa, {
        etapa: dimensao === "etapa" ? valor : "",
        imobiliaria: dimensao === "imobiliaria" ? valor : "",
        produto: dimensao === "produto" ? valor : "",
        quantidade: String(grupo.length),
      }),
      condicaoAtiva: grupo.length >= limite,
    });
  }
  return especs;
}

function avaliarOciosidadeImobiliaria(
  regra: RegraAuditoria,
  linhas: LinhaPlanilha[],
  registrosAntigos: Map<string, Registro>,
  importacaoId: string
): AvaliacaoDinamica[] {
  const quadro = quadroParaAgregado(regra);
  const diasLimite = regra.parametros.dias ?? 0;
  if (!quadro || !diasLimite) return [];

  // Data da pasta mais recente de cada imobiliária, olhando só o que este sistema já registrou
  // (nunca uma base antiga: `criadoEm` só existe a partir do dia em que a pasta entrou aqui).
  const ultimaPastaPorImobiliaria = new Map<string, string>();
  for (const registro of registrosAntigos.values()) {
    const nome = registro.responsavel?.trim();
    if (!nome) continue;
    const atual = ultimaPastaPorImobiliaria.get(nome);
    if (!atual || registro.criadoEm > atual) ultimaPastaPorImobiliaria.set(nome, registro.criadoEm);
  }
  for (const linha of linhas) {
    if (registrosAntigos.has(linha.numero)) continue; // não é uma pasta nova nesta importação
    const nome = linha.responsavel?.trim();
    if (!nome) continue;
    ultimaPastaPorImobiliaria.set(nome, importacaoId); // pasta nova hoje: sempre a mais recente
  }

  const especs: AvaliacaoDinamica[] = [];
  for (const [imobiliaria, ultimaData] of ultimaPastaPorImobiliaria) {
    const diasSemEnviar = Math.floor((Date.parse(importacaoId) - Date.parse(ultimaData.slice(0, 10))) / 86_400_000);
    especs.push({
      chaveRegra: `DINAMICA::${regra.id}::${normalize(imobiliaria)}`,
      origem: "agregado",
      quadro,
      numerosRelacionados: null,
      imobiliaria,
      etapa: "",
      tipoPendencia: regra.nomeRegra,
      descricao: substituirVariaveis(regra.textoTarefa, { imobiliaria, dias: String(diasSemEnviar) }),
      condicaoAtiva: diasSemEnviar >= diasLimite,
    });
  }
  return especs;
}

// Categorias ainda não implementadas: Análise Textual, Regressão, Qualidade/Reprovação,
// Conformidade, Ações Positivas e SLA Interno (esta última nem olha a planilha — precisa de
// acesso às próprias tarefas do sistema, não a `linhas`). Regras cadastradas nessas categorias
// ficam ativas na tela, mas `avaliarRegrasAgregadasDinamicas` as ignora silenciosamente por ora.
