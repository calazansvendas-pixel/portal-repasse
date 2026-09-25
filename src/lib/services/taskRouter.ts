import { normalize, resolvePracaPorCidade } from "@/lib/auth/roles";
import type { LinhaPlanilha } from "./parseSheet";
import type { NivelTarefa, Quadro, QuadroEscalonamento, SlaStatus } from "@/lib/types";
import { ASSISTENTE_LABEL } from "@/lib/types";
import { SLA_LABEL } from "@/lib/utils/sla";

/**
 * Motor de regras hierárquico (Daily Delta): cada nível da operação recebe
 * tarefas geradas com um gatilho e um texto de ação próprios.
 *   - Nível operacional (assistentes): gerado por LINHA, roteado pela cidade.
 *   - Nível analítico/tático por linha (Risco Bancário / Erro de Processo):
 *     gerado por LINHA, mas nativo do quadro da Analista/Coordenador.
 *   - Nível analítico/tático agregado (Gargalo / Filtro Ruim): gerado
 *     cruzando várias linhas da mesma importação.
 */

export interface EspecTarefaLinha {
  chaveRegra: string; // `${numero}::${regra}` — identidade estável entre importações
  nivel: NivelTarefa;
  quadro: Quadro;
  tipoPendencia: string;
  descricao: string;
}

/** Etapa 0.01 (Inclusão da pasta) — a virada dela não depende das assistentes. */
export function ehEtapaInclusao(etapa: string | null | undefined): boolean {
  return (etapa ?? "").trim().startsWith("0.01");
}

/** Um novo card de "Inércia inicial" só nasce no 3º dia após a última conclusão da pasta. */
export const DIAS_COOLDOWN_INCLUSAO = 3;

/** true se ainda estamos na janela de respiro: importação (yyyy-MM-dd) < conclusão + 3 dias (fuso de Brasília). */
export function dentroDoCooldownInclusao(importacaoId: string, resolvidoEmISO: string): boolean {
  const dataConclusao = new Date(resolvidoEmISO).toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const dias = (Date.parse(importacaoId) - Date.parse(dataConclusao)) / 86_400_000;
  return dias < DIAS_COOLDOWN_INCLUSAO;
}

function nomeCliente(linha: LinhaPlanilha): string {
  return linha.clienteNome.trim() || "cliente não identificado";
}

function nomeImobiliaria(linha: LinhaPlanilha): string {
  return linha.responsavel.trim() || "imobiliária não informada";
}

export interface EspecTarefaAgregada {
  chaveRegra: string; // `AGREGADO::${regra}::${chave}`
  nivel: NivelTarefa;
  quadro: Quadro;
  cidade: string;
  etapa: string;
  imobiliaria: string;
  tipoPendencia: string;
  descricao: string;
  numerosRelacionados: string[];
}

function contemAlgumTermo(observacaoNormalizada: string, termos: string[]): string | null {
  for (const termo of termos) {
    const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escapado}\\b`, "i").test(observacaoNormalizada)) return termo;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Nível Operacional (Assistentes) — um card por pasta, roteado por cidade.
// ---------------------------------------------------------------------------

const TERMOS_QUALIFICACAO = ["apontamento", "restricao"];
const TERMOS_DOCUMENTACAO: { termo: string; label: string }[] = [
  { termo: "irpf", label: "IRPF pendente" },
  { termo: "fgts", label: "FGTS pendente" },
  { termo: "rg", label: "RG pendente" },
  { termo: "certidao", label: "Certidão pendente" },
  { termo: "estado civil", label: "Estado civil pendente" },
];

/**
 * Dicionário legado (mantido como fallback): cobre pendências que não se
 * encaixam nos 3 gatilhos operacionais explícitos, para não deixar nenhuma
 * observação sem tarefa gerada. Tom de consultoria/ajuda, não de cobrança.
 */
const REGRAS_PENDENCIA_LEGADO: { padroes: string[]; tipoPendencia: string; acao: string }[] = [
  { padroes: ["comprovante de renda", "comprovante renda"], tipoPendencia: "Comprovante de renda", acao: "auxiliar na obtenção do comprovante de renda atualizado" },
  { padroes: ["comprovante de residencia", "comprovante residencia", "comprovante de endereco"], tipoPendencia: "Comprovante de residência", acao: "auxiliar na obtenção do comprovante de residência atualizado" },
  { padroes: ["assinatura", "contrato nao assinado", "aguardando assinatura"], tipoPendencia: "Assinatura de contrato", acao: "apoiar a conclusão da assinatura do contrato" },
  { padroes: ["vencido", "venceu", "vencida"], tipoPendencia: "Documento vencido", acao: "auxiliar na atualização do documento vencido" },
  { padroes: ["banco", "financiamento"], tipoPendencia: "Pendência bancária/financiamento", acao: "acompanhar junto ao banco o andamento do financiamento" },
  { padroes: ["pendente", "pendencia", "falta", "aguardando"], tipoPendencia: "Documentação pendente", acao: "levantar e apoiar a organização da documentação pendente" },
];

const SLA_ACAO_LABEL: Record<SlaStatus, string> = {
  no_prazo: SLA_LABEL.no_prazo,
  atencao: SLA_LABEL.atencao,
  urgente: SLA_LABEL.urgente,
  estourado: SLA_LABEL.estourado,
};

/** Gera a tarefa do quadro regional (assistente) para uma linha, se houver gatilho. */
export function gerarEspecOperacional(
  linha: LinhaPlanilha,
  praca: Quadro,
  slaStatus: SlaStatus
): EspecTarefaLinha | null {
  const obsNorm = normalize(linha.observacao);
  const etapaNorm = linha.etapa.trim();
  const cliente = nomeCliente(linha);
  const imobiliaria = nomeImobiliaria(linha);

  // 1) Inércia inicial: nem começou a ser tratada e o prazo já estourou.
  if (ehEtapaInclusao(etapaNorm) && slaStatus === "estourado") {
    return {
      chaveRegra: `${linha.numero}::inercia_inicial`,
      nivel: "operacional",
      quadro: praca,
      tipoPendencia: "Inércia inicial",
      descricao:
        "Ligar para o corretor para oferecer ajuda com a documentação ou verificar se ele apenas esqueceu de avançar a etapa no sistema.",
    };
  }

  // 2) Qualificação: apontamento/restrição no nome do cliente — mais urgente que doc. de rotina.
  if (contemAlgumTermo(obsNorm, TERMOS_QUALIFICACAO)) {
    return {
      chaveRegra: `${linha.numero}::qualificacao`,
      nivel: "operacional",
      quadro: praca,
      tipoPendencia: "Qualificação / restrição",
      descricao: `Orientar a ${imobiliaria} sobre restrições do cliente ${cliente} e ajudar a buscar soluções.`,
    };
  }

  // 3) Documentação de rotina (IRPF, FGTS, RG, certidão, estado civil).
  for (const { termo, label } of TERMOS_DOCUMENTACAO) {
    if (contemAlgumTermo(obsNorm, [termo])) {
      return {
        chaveRegra: `${linha.numero}::documentacao`,
        nivel: "operacional",
        quadro: praca,
        tipoPendencia: label,
        descricao: `Prestar consultoria à ${imobiliaria} sobre a documentação do cliente ${cliente}.`,
      };
    }
  }

  // 4) Fallback legado, para não perder cobertura de pendências fora dos 3 gatilhos acima.
  for (const regra of REGRAS_PENDENCIA_LEGADO) {
    if (regra.padroes.some((p) => obsNorm.includes(p))) {
      return {
        chaveRegra: `${linha.numero}::operacional`,
        nivel: "operacional",
        quadro: praca,
        tipoPendencia: regra.tipoPendencia,
        descricao: `Ligar para a ${imobiliaria} e ${regra.acao} do cliente ${cliente}. SLA: ${SLA_ACAO_LABEL[slaStatus]}`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Nível Analítico por linha (Andressa) — Risco Bancário
// ---------------------------------------------------------------------------

const TERMOS_RISCO_BANCARIO = ["greve", "bloqueado", "agencia"];

export function gerarEspecRiscoBancario(linha: LinhaPlanilha): EspecTarefaLinha | null {
  const obsNorm = normalize(linha.observacao);
  if (!contemAlgumTermo(obsNorm, TERMOS_RISCO_BANCARIO)) return null;

  const cliente = nomeCliente(linha);
  return {
    chaveRegra: `${linha.numero}::risco_bancario`,
    nivel: "analitico",
    quadro: "analista",
    tipoPendencia: "Risco bancário",
    descricao: `Intervenção Manual: Acionar Caixa para destravar a pasta do cliente ${cliente}.`,
  };
}

// ---------------------------------------------------------------------------
// Nível Tático por linha (Paulo) — Erro de Processo Básico
// ---------------------------------------------------------------------------

const PADROES_ERRO_PROCESSO = [/\bilegiv[ei]l/i, /\bcortes?\b/i, /mais de 10 anos/i, /nao renomeado/i];

export function gerarEspecErroProcesso(linha: LinhaPlanilha): EspecTarefaLinha | null {
  const obsNorm = normalize(linha.observacao);
  if (!PADROES_ERRO_PROCESSO.some((re) => re.test(obsNorm))) return null;

  const imobiliaria = nomeImobiliaria(linha);
  return {
    chaveRegra: `${linha.numero}::erro_processo`,
    nivel: "tatico",
    quadro: "coordenador",
    tipoPendencia: "Erro de processo básico",
    descricao: `Agendar visita de relacionamento com a ${imobiliaria} para um treinamento amigável sobre qualidade no envio de pastas.`,
  };
}

// ---------------------------------------------------------------------------
// Agregados (cruzam várias linhas da mesma importação)
// ---------------------------------------------------------------------------

const LIMITE_GARGALO = 4;
const LIMITE_FILTRO_RUIM = 2;
const TERMOS_FILTRO_RUIM = ["margem insuficiente", "alto endividamento"];

/** 4+ pastas paradas na mesma etapa, na mesma cidade -> alerta de gargalo para a Analista. */
export function detectarGargalos(linhas: LinhaPlanilha[]): EspecTarefaAgregada[] {
  const grupos = new Map<string, LinhaPlanilha[]>();
  for (const linha of linhas) {
    const chave = `${normalize(linha.cidade)}::${linha.etapa.trim()}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha]);
  }

  const especs: EspecTarefaAgregada[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.length < LIMITE_GARGALO) continue;
    const { cidade, etapa } = grupo[0];
    const assistenteResponsavel = resolvePracaPorCidade(cidade);
    const nomeAssistente = assistenteResponsavel
      ? ASSISTENTE_LABEL[assistenteResponsavel]
      : "assistente responsável pela praça";
    especs.push({
      chaveRegra: `AGREGADO::gargalo::${normalize(cidade)}::${etapa.trim()}`,
      nivel: "analitico",
      quadro: "analista",
      cidade,
      etapa,
      imobiliaria: "",
      tipoPendencia: "Gargalo de etapa",
      descricao: `Gargalo de ${grupo.length} pastas na etapa ${etapa} em ${cidade}. Alinhar plano de ação tático com a assistente ${nomeAssistente}.`,
      numerosRelacionados: grupo.map((l) => l.numero),
    });
  }
  return especs;
}

/** 2+ pastas da mesma imobiliária com margem insuficiente/alto endividamento -> alinhar régua com o Coordenador. */
export function detectarFiltroRuim(linhas: LinhaPlanilha[]): EspecTarefaAgregada[] {
  const grupos = new Map<string, LinhaPlanilha[]>();
  for (const linha of linhas) {
    if (!contemAlgumTermo(normalize(linha.observacao), TERMOS_FILTRO_RUIM)) continue;
    const chave = linha.responsavel.trim() || "Não informado";
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha]);
  }

  const especs: EspecTarefaAgregada[] = [];
  for (const [imobiliaria, grupo] of grupos) {
    if (grupo.length < LIMITE_FILTRO_RUIM) continue;
    especs.push({
      chaveRegra: `AGREGADO::filtro_ruim::${normalize(imobiliaria)}`,
      nivel: "tatico",
      quadro: "coordenador",
      cidade: "",
      etapa: "",
      imobiliaria,
      tipoPendencia: "Filtro de qualificação",
      descricao: `Alinhar régua MCMV com a Imobiliária ${imobiliaria}.`,
      numerosRelacionados: grupo.map((l) => l.numero),
    });
  }
  return especs;
}

/** Reaproveitado pelas métricas estratégicas da Gerência (Taxa de Vazamento de Funil). */
export function contemQualificacaoRuim(observacao: string): boolean {
  return contemAlgumTermo(normalize(observacao), TERMOS_QUALIFICACAO) !== null;
}

// ---------------------------------------------------------------------------
// Escalonamento simultâneo (SLA crítico -> Coordenador; falha de auditoria -> Analista)
// ---------------------------------------------------------------------------

/**
 * Escalonamento simultâneo é restrito à Analista, em falha de auditoria.
 * O Coordenador NUNCA recebe tarefas por SLA estourado/urgente — o quadro
 * dele só recebe as tarefas nativas dos seus gatilhos táticos ("Erro de
 * processo básico" e "Filtro de qualificação ruim"), geradas diretamente
 * com quadro "coordenador" em taskRouter.ts.
 */
export function calcularEscalonamento(params: {
  quadro: Quadro;
  falhouAuditoriaAgora: boolean;
}): QuadroEscalonamento[] {
  const { quadro, falhouAuditoriaAgora } = params;
  const escalonamento: QuadroEscalonamento[] = [];
  if (falhouAuditoriaAgora && quadro !== "analista") {
    escalonamento.push("analista");
  }
  return escalonamento;
}
