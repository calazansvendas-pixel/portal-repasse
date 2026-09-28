import type { Firestore } from "firebase-admin/firestore";
import { normalize, resolvePracaPorCidade } from "@/lib/auth/roles";
import { ehFimDeEsteira } from "./taskRouter";
import type { LinhaPlanilha } from "./parseSheet";
import type { CategoriaGatilho, RegraAuditoria } from "@/lib/types/regrasAuditoria";
import type { EtapaHistorico, Quadro, Registro, Tarefa } from "@/lib/types";

/**
 * Avaliador Dinâmico do Motor de Regras (No-Code) — Fase 3: as 9 categorias já têm lógica.
 *
 * `avaliarRegra` é o roteador ÚNICO por categoria (switch/case exaustivo — o TypeScript recusa o
 * build se uma categoria nova entrar em `CategoriaGatilho` sem ganhar um `case` aqui). Cada
 * categoria só produz resultado quando recebe, em `ContextoAvaliacao`, os dados de que precisa:
 * as de "linha" (SLA e Estagnação, Análise Textual, Regressão, Conformidade/vencimento longo)
 * usam `linha` + `historicoPasta`; as agregadas (Volume e Gargalos, Ociosidade, Qualidade,
 * Conformidade/duplicidade, Ações Positivas) usam `todasLinhas`; SLA Interno usa `tarefasPorChave`
 * (ela olha as próprias tarefas do sistema, não a planilha). `auditEngine.ts` chama os três
 * "adaptadores" no fim do arquivo, cada um no ponto do motor em que o contexto certo já existe.
 *
 * Limitações conhecidas (mantidas desde a Fase 2): uma regra com `cargoDestino: "gerencia"` nunca
 * gera tarefa (a Gerência não tem quadro/coluna própria no painel); categorias agregadas com
 * `cargoDestino: "assistente"` também não geram, porque o agrupamento não aponta uma única praça
 * com segurança.
 */

/** Uma ocorrência de regra dinâmica pronta para virar (ou fechar) uma tarefa. */
export interface AvaliacaoDinamica {
  chaveRegra: string; // `DINAMICA::${regra.id}::${identificador}` — estável entre importações
  origem: "linha" | "agregado";
  quadro: Quadro;
  numerosRelacionados: string[] | null;
  // Nomes dos clientes, na mesma ordem de numerosRelacionados — só para exibição direta no card.
  nomesRelacionados?: string[] | null;
  imobiliaria: string;
  etapa: string;
  tipoPendencia: string;
  descricao: string;
  condicaoAtiva: boolean;
}

/** O que cada categoria pode precisar; cada chamador só preenche o que já tem à mão. */
export interface ContextoAvaliacao {
  linha?: LinhaPlanilha;
  historicoPasta?: EtapaHistorico[];
  antigo?: Registro | null;
  todasLinhas?: LinhaPlanilha[];
  registrosAntigos?: Map<string, Registro>;
  tarefasPorChave?: Map<string, { id: string; data: Tarefa }>;
  importacaoId: string;
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

function diasEntre(dataMaisRecenteISO: string, dataMaisAntigaISO: string): number {
  return Math.floor((Date.parse(dataMaisRecenteISO.slice(0, 10)) - Date.parse(dataMaisAntigaISO.slice(0, 10))) / 86_400_000);
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
// Roteador único (o "switch/case" pedido) — uma regra de cada vez.
// ---------------------------------------------------------------------------

export function avaliarRegra(regra: RegraAuditoria, ctx: ContextoAvaliacao): AvaliacaoDinamica[] {
  const categoria: CategoriaGatilho = regra.categoriaGatilho;
  switch (categoria) {
    case "sla_estagnacao":
      return ctx.linha && ctx.historicoPasta ? soArray(avaliarSlaEstagnacao(regra, ctx.linha, ctx.historicoPasta)) : [];
    case "analise_textual":
      return ctx.linha ? soArray(avaliarAnaliseTextual(regra, ctx.linha)) : [];
    case "regressao":
      return ctx.linha ? soArray(avaliarRegressao(regra, ctx.linha, ctx.antigo ?? null)) : [];
    case "conformidade":
      if (regra.parametros.subtipoConformidade === "vencimento_longo") {
        return ctx.linha ? soArray(avaliarVencimentoLongo(regra, ctx.linha, ctx.importacaoId)) : [];
      }
      return ctx.todasLinhas ? avaliarDuplicidade(regra, ctx.todasLinhas) : [];
    case "volume_gargalo":
      return ctx.todasLinhas ? avaliarVolumeGargalo(regra, ctx.todasLinhas) : [];
    case "ociosidade_imobiliaria":
      return ctx.todasLinhas && ctx.registrosAntigos
        ? avaliarOciosidadeImobiliaria(regra, ctx.todasLinhas, ctx.registrosAntigos, ctx.importacaoId)
        : [];
    case "qualidade_reprovacao":
      return ctx.todasLinhas ? avaliarQualidadeReprovacao(regra, ctx.todasLinhas) : [];
    case "acoes_positivas":
      return ctx.todasLinhas && ctx.registrosAntigos
        ? avaliarAcoesPositivas(regra, ctx.todasLinhas, ctx.registrosAntigos)
        : [];
    case "sla_interno":
      return ctx.tarefasPorChave ? avaliarSlaInterno(regra, ctx.tarefasPorChave, ctx.importacaoId) : [];
    default: {
      // Exhaustividade: se uma categoria nova entrar em CategoriaGatilho sem um case aqui, o
      // TypeScript aponta o erro nesta linha.
      const _exaustivo: never = categoria;
      return _exaustivo;
    }
  }
}

function soArray<T>(item: T | null): T[] {
  return item ? [item] : [];
}

// ---------------------------------------------------------------------------
// Categorias avaliadas POR LINHA (uma pasta de cada vez).
// ---------------------------------------------------------------------------

function avaliarSlaEstagnacao(
  regra: RegraAuditoria,
  linha: LinhaPlanilha,
  historicoPasta: EtapaHistorico[]
): AvaliacaoDinamica | null {
  const quadro = quadroParaLinha(regra, linha.cidade);
  // `dias: 0` é um gatilho válido (ação imediata ao entrar na etapa) — só falta configuração
  // quando o campo nem foi preenchido (undefined), nunca quando o valor é zero.
  if (!quadro || regra.parametros.dias === undefined) return null;
  const diasLimite = regra.parametros.dias;
  // A planilha traz a etapa com sufixo descritivo (ex.: "1.17 - Documentação incompleta"); a
  // regra cadastra só o código (ex.: "1.17"). Basta o código bater no início da etapa da linha.
  const etapaAlvo = regra.parametros.etapa?.trim();
  if (etapaAlvo && !linha.etapa.trim().toUpperCase().startsWith(etapaAlvo.toUpperCase())) return null;

  const diasParada = diasConsecutivosNaEtapa(historicoPasta, linha.etapa);
  return {
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
  };
}

function avaliarAnaliseTextual(regra: RegraAuditoria, linha: LinhaPlanilha): AvaliacaoDinamica | null {
  const quadro = quadroParaLinha(regra, linha.cidade);
  const palavraChave = regra.parametros.palavraChave?.trim();
  if (!quadro || !palavraChave) return null;

  const bate = normalize(linha.observacao).includes(normalize(palavraChave));
  return {
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
      palavraChave,
    }),
    condicaoAtiva: bate,
  };
}

/** Etapas seguem o padrão "N.NN" (ex.: 0.80, 9.01); comparar como número basta para detectar retrocesso. */
function valorNumericoDaEtapa(etapa: string): number | null {
  const n = Number.parseFloat(etapa.trim());
  return Number.isNaN(n) ? null : n;
}

function avaliarRegressao(regra: RegraAuditoria, linha: LinhaPlanilha, antigo: Registro | null): AvaliacaoDinamica | null {
  const quadro = quadroParaLinha(regra, linha.cidade);
  if (!quadro || !antigo) return null;

  const etapaAntiga = valorNumericoDaEtapa(antigo.etapa);
  const etapaNova = valorNumericoDaEtapa(linha.etapa);
  const regrediu = etapaAntiga !== null && etapaNova !== null && etapaNova < etapaAntiga;

  return {
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
      etapaAnterior: antigo.etapa,
      etapa: linha.etapa,
    }),
    // Regressão de verdade é sempre um sinal pontual; a importação seguinte fecha sozinha se a
    // pasta voltar a avançar (o `!condicaoAtiva` do reconciliarTarefa cuida disso).
    condicaoAtiva: regrediu,
  };
}

function avaliarVencimentoLongo(regra: RegraAuditoria, linha: LinhaPlanilha, importacaoId: string): AvaliacaoDinamica | null {
  const quadro = quadroParaLinha(regra, linha.cidade);
  if (!quadro || regra.parametros.dias === undefined || !linha.prazoEtapa) return null;
  const diasLimite = regra.parametros.dias;

  const diasAteVencer = diasEntre(linha.prazoEtapa, importacaoId);
  return {
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
      dias: String(diasAteVencer),
    }),
    condicaoAtiva: diasAteVencer >= diasLimite,
  };
}

// ---------------------------------------------------------------------------
// Categorias avaliadas EM BLOCO (cruzam todas as linhas da importação de uma vez).
// ---------------------------------------------------------------------------

const PREFIXO_NUMERICO_NOME = /^(\d+\.\d+)/;

/** Código de etapa de uma linha: "1.17 - Documentação incompleta" -> "1.17" (mesmo critério do Kanban). */
function codigoEtapaLinha(etapa: string): string {
  return etapa.trim().split(" - ")[0]?.trim() || etapa.trim();
}

/** Prefixo numérico do nome da regra, se houver — mesma convenção da ordenação em motor-regras/page.tsx. */
function etapaAlvoDoNome(nomeRegra: string): string | null {
  return nomeRegra.trim().match(PREFIXO_NUMERICO_NOME)?.[1] ?? null;
}

/** Nomes dos clientes de um grupo de pastas, na mesma ordem — para exibir direto no card, sem clicar. */
function nomesDoGrupo(grupo: LinhaPlanilha[]): string[] {
  return grupo.map((l) => l.clienteNome || `Pasta ${l.numero}`);
}

function avaliarVolumeGargalo(regra: RegraAuditoria, todasLinhas: LinhaPlanilha[]): AvaliacaoDinamica[] {
  const quadro = quadroParaAgregado(regra);
  const limite = regra.parametros.quantidade ?? 0;
  if (!quadro || !limite) return [];
  const dimensao = regra.parametros.dimensao ?? "etapa";

  // Nome com prefixo numérico (ex.: "0.99 - Pasta completa") amarra a regra a UMA etapa
  // específica — filtra estritamente por ela, nunca mistura pastas de outras etapas sob o
  // rótulo desta regra (bug: uma regra da 0.99 varria a planilha inteira e gerava um card por
  // etapa encontrada, inclusive 0.01, todos rotulados com o nome da regra da 0.99).
  const etapaAlvo = dimensao === "etapa" ? etapaAlvoDoNome(regra.nomeRegra) : null;

  if (etapaAlvo) {
    const grupo = todasLinhas.filter((l) => !ehFimDeEsteira(l.etapa) && codigoEtapaLinha(l.etapa) === etapaAlvo);
    // Sempre emite — mesmo com 0 pastas — para que reconciliarTarefa feche uma tarefa antiga se
    // a contagem cair a zero; condicaoAtiva: false nunca CRIA uma tarefa nova (ver auditEngine.ts).
    return [
      {
        chaveRegra: `DINAMICA::${regra.id}::${normalize(etapaAlvo)}`,
        origem: "agregado",
        quadro,
        numerosRelacionados: grupo.map((l) => l.numero),
        nomesRelacionados: nomesDoGrupo(grupo),
        imobiliaria: "",
        etapa: etapaAlvo,
        tipoPendencia: regra.nomeRegra,
        descricao: substituirVariaveis(regra.textoTarefa, {
          etapa: etapaAlvo,
          quantidade: String(grupo.length),
        }),
        condicaoAtiva: grupo.length >= limite,
      },
    ];
  }

  // Sem prefixo no nome: comportamento histórico — varre todas as etapas presentes na planilha e
  // sinaliza gargalo em qualquer uma que bater o limite (a regra não é sobre uma etapa específica).
  const grupos = new Map<string, LinhaPlanilha[]>();
  for (const linha of todasLinhas) {
    if (ehFimDeEsteira(linha.etapa)) continue; // pasta já concluída não é gargalo
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
      nomesRelacionados: nomesDoGrupo(grupo),
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
  todasLinhas: LinhaPlanilha[],
  registrosAntigos: Map<string, Registro>,
  importacaoId: string
): AvaliacaoDinamica[] {
  const quadro = quadroParaAgregado(regra);
  if (!quadro || regra.parametros.dias === undefined) return [];
  const diasLimite = regra.parametros.dias;

  // Data da pasta mais recente de cada imobiliária, olhando só o que este sistema já registrou
  // (nunca uma base antiga: `criadoEm` só existe a partir do dia em que a pasta entrou aqui).
  const ultimaPastaPorImobiliaria = new Map<string, string>();
  for (const registro of registrosAntigos.values()) {
    const nome = registro.responsavel?.trim();
    if (!nome) continue;
    const atual = ultimaPastaPorImobiliaria.get(nome);
    if (!atual || registro.criadoEm > atual) ultimaPastaPorImobiliaria.set(nome, registro.criadoEm);
  }
  for (const linha of todasLinhas) {
    if (registrosAntigos.has(linha.numero)) continue; // não é uma pasta nova nesta importação
    const nome = linha.responsavel?.trim();
    if (!nome) continue;
    ultimaPastaPorImobiliaria.set(nome, importacaoId); // pasta nova hoje: sempre a mais recente
  }

  const especs: AvaliacaoDinamica[] = [];
  for (const [imobiliaria, ultimaData] of ultimaPastaPorImobiliaria) {
    const diasSemEnviar = diasEntre(importacaoId, ultimaData);
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

/** Termos que indicam que a pasta foi barrada/negada — usados só por "Qualidade / Reprovação". */
const TERMOS_REPROVACAO = ["reprovad", "recusad", "indeferid", "negad"];

function avaliarQualidadeReprovacao(regra: RegraAuditoria, todasLinhas: LinhaPlanilha[]): AvaliacaoDinamica[] {
  const quadro = quadroParaAgregado(regra);
  const limite = regra.parametros.quantidade ?? 0;
  if (!quadro || !limite) return [];

  const porImobiliaria = new Map<string, LinhaPlanilha[]>();
  for (const linha of todasLinhas) {
    const obs = normalize(linha.observacao);
    if (!TERMOS_REPROVACAO.some((termo) => obs.includes(termo))) continue;
    const nome = linha.responsavel?.trim();
    if (!nome) continue;
    porImobiliaria.set(nome, [...(porImobiliaria.get(nome) ?? []), linha]);
  }

  const especs: AvaliacaoDinamica[] = [];
  for (const [imobiliaria, grupo] of porImobiliaria) {
    especs.push({
      chaveRegra: `DINAMICA::${regra.id}::${normalize(imobiliaria)}`,
      origem: "agregado",
      quadro,
      numerosRelacionados: grupo.map((l) => l.numero),
      nomesRelacionados: nomesDoGrupo(grupo),
      imobiliaria,
      etapa: "",
      tipoPendencia: regra.nomeRegra,
      descricao: substituirVariaveis(regra.textoTarefa, { imobiliaria, quantidade: String(grupo.length) }),
      condicaoAtiva: grupo.length >= limite,
    });
  }
  return especs;
}

function avaliarDuplicidade(regra: RegraAuditoria, todasLinhas: LinhaPlanilha[]): AvaliacaoDinamica[] {
  const quadro = quadroParaAgregado(regra);
  if (!quadro) return [];

  const porCpf = new Map<string, LinhaPlanilha[]>();
  for (const linha of todasLinhas) {
    const cpf = linha.cpfCnpj?.trim();
    if (!cpf) continue;
    porCpf.set(cpf, [...(porCpf.get(cpf) ?? []), linha]);
  }

  const especs: AvaliacaoDinamica[] = [];
  for (const [cpf, grupo] of porCpf) {
    const numeros = [...new Set(grupo.map((l) => l.numero))];
    if (numeros.length < 2) continue; // mesmo CPF em mais de UMA pasta ainda ativa
    especs.push({
      chaveRegra: `DINAMICA::${regra.id}::${normalize(cpf)}`,
      origem: "agregado",
      quadro,
      numerosRelacionados: numeros,
      nomesRelacionados: nomesDoGrupo(grupo),
      imobiliaria: grupo[0].responsavel,
      etapa: "",
      tipoPendencia: regra.nomeRegra,
      descricao: substituirVariaveis(regra.textoTarefa, {
        cliente: grupo[0].clienteNome || "cliente não identificado",
        numeros: numeros.join(", "),
        quantidade: String(numeros.length),
      }),
      condicaoAtiva: true,
    });
  }
  return especs;
}

function avaliarAcoesPositivas(
  regra: RegraAuditoria,
  todasLinhas: LinhaPlanilha[],
  registrosAntigos: Map<string, Registro>
): AvaliacaoDinamica[] {
  const quadro = quadroParaAgregado(regra);
  const limite = regra.parametros.quantidade ?? 0;
  if (!quadro || !limite) return [];

  const porImobiliaria = new Map<string, LinhaPlanilha[]>();
  for (const linha of todasLinhas) {
    if (!ehFimDeEsteira(linha.etapa)) continue;
    const antigo = registrosAntigos.get(linha.numero);
    const jaEstavaConcluida = antigo ? ehFimDeEsteira(antigo.etapa) : false;
    if (jaEstavaConcluida) continue; // conta só quem CHEGOU lá nesta importação, não quem já tinha chegado
    const nome = linha.responsavel?.trim();
    if (!nome) continue;
    porImobiliaria.set(nome, [...(porImobiliaria.get(nome) ?? []), linha]);
  }

  const especs: AvaliacaoDinamica[] = [];
  for (const [imobiliaria, grupo] of porImobiliaria) {
    especs.push({
      chaveRegra: `DINAMICA::${regra.id}::${normalize(imobiliaria)}`,
      origem: "agregado",
      quadro,
      numerosRelacionados: grupo.map((l) => l.numero),
      nomesRelacionados: nomesDoGrupo(grupo),
      imobiliaria,
      etapa: "",
      tipoPendencia: regra.nomeRegra,
      descricao: substituirVariaveis(regra.textoTarefa, { imobiliaria, quantidade: String(grupo.length) }),
      condicaoAtiva: grupo.length >= limite,
    });
  }
  return especs;
}

// ---------------------------------------------------------------------------
// SLA Interno — a única categoria que olha as PRÓPRIAS TAREFAS do sistema, não a planilha.
// ---------------------------------------------------------------------------

function avaliarSlaInterno(
  regra: RegraAuditoria,
  tarefasPorChave: Map<string, { id: string; data: Tarefa }>,
  importacaoId: string
): AvaliacaoDinamica[] {
  const quadro = quadroParaAgregado(regra);
  if (!quadro || regra.parametros.dias === undefined) return [];
  const diasLimite = regra.parametros.dias;

  const especs: AvaliacaoDinamica[] = [];
  for (const { id, data } of tarefasPorChave.values()) {
    // Nunca cria um alerta sobre outro alerta (evita um ciclo sem fim de auto-vigilância).
    if (data.chaveRegra.startsWith("DINAMICA::")) continue;
    if (data.status !== "pendente" && data.status !== "audit_failed") continue;
    if (data.praca !== quadro) continue;

    const diasAberta = diasEntre(importacaoId, data.criadoEm);
    if (diasAberta < diasLimite) continue;

    especs.push({
      chaveRegra: `DINAMICA::${regra.id}::sla_interno::${id}`,
      origem: "agregado",
      quadro,
      numerosRelacionados: null,
      imobiliaria: "",
      etapa: "",
      tipoPendencia: regra.nomeRegra,
      descricao: substituirVariaveis(regra.textoTarefa, {
        tarefa: data.tipoPendencia || data.descricao || "tarefa",
        dias: String(diasAberta),
      }),
      condicaoAtiva: true,
    });
  }
  return especs;
}

// ---------------------------------------------------------------------------
// Adaptadores chamados por auditEngine.ts — cada um no ponto do motor em que o
// contexto necessário já existe, todos passando por `avaliarRegra` acima.
// ---------------------------------------------------------------------------

/** Chamado dentro do laço por pasta (Passo 1): SLA/Estagnação, Análise Textual, Regressão e
 * Conformidade/vencimento longo — todas precisam do histórico/estado daquela pasta específica. */
export function avaliarRegrasPorLinha(
  regras: RegraAuditoria[],
  linha: LinhaPlanilha,
  historicoPasta: EtapaHistorico[],
  antigo: Registro | null,
  importacaoId: string
): AvaliacaoDinamica[] {
  const ctx: ContextoAvaliacao = { linha, historicoPasta, antigo, importacaoId };
  return regras.flatMap((r) => avaliarRegra(r, ctx));
}

/** Chamado depois do laço por pasta (Passo 3): Volume/Gargalos, Ociosidade, Qualidade,
 * Conformidade/duplicidade e Ações Positivas — todas cruzam a importação inteira de uma vez. */
export function avaliarRegrasAgregadasDinamicas(
  regras: RegraAuditoria[],
  todasLinhas: LinhaPlanilha[],
  registrosAntigos: Map<string, Registro>,
  importacaoId: string
): AvaliacaoDinamica[] {
  const ctx: ContextoAvaliacao = { todasLinhas, registrosAntigos, importacaoId };
  return regras.flatMap((r) => avaliarRegra(r, ctx));
}

/** Chamado por último (Passo 4): SLA Interno, sobre as tarefas ativas do próprio sistema. */
export function avaliarRegrasDeTarefas(
  regras: RegraAuditoria[],
  tarefasPorChave: Map<string, { id: string; data: Tarefa }>,
  importacaoId: string
): AvaliacaoDinamica[] {
  const ctx: ContextoAvaliacao = { tarefasPorChave, importacaoId };
  return regras.flatMap((r) => avaliarRegra(r, ctx));
}
