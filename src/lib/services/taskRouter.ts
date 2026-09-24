import { normalize } from "@/lib/auth/roles";
import type { LinhaPlanilha } from "./parseSheet";
import type { NivelTarefa, Quadro, QuadroEscalonamento, SlaStatus } from "@/lib/types";
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

/** Recorta um trecho da observação ORIGINAL ao redor do termo encontrado (para citar no card). */
function extrairRecorte(observacaoOriginal: string, termoNormalizado: string, janela = 50): string {
  const normalizado = normalize(observacaoOriginal);
  const idx = normalizado.indexOf(termoNormalizado);
  if (idx === -1) {
    const corte = observacaoOriginal.trim().slice(0, janela);
    return corte + (observacaoOriginal.trim().length > janela ? "…" : "");
  }
  const inicio = Math.max(0, idx - janela / 2);
  const fim = Math.min(observacaoOriginal.length, idx + termoNormalizado.length + janela / 2);
  const recorte = observacaoOriginal.slice(inicio, fim).trim();
  return (inicio > 0 ? "…" : "") + recorte + (fim < observacaoOriginal.length ? "…" : "");
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
 * observação sem tarefa gerada.
 */
const REGRAS_PENDENCIA_LEGADO: { padroes: string[]; tipoPendencia: string; acao: string }[] = [
  { padroes: ["comprovante de renda", "comprovante renda"], tipoPendencia: "Comprovante de renda", acao: "Cobrar comprovante de renda atualizado" },
  { padroes: ["comprovante de residencia", "comprovante residencia", "comprovante de endereco"], tipoPendencia: "Comprovante de residência", acao: "Cobrar comprovante de residência atualizado" },
  { padroes: ["assinatura", "contrato nao assinado", "aguardando assinatura"], tipoPendencia: "Assinatura de contrato", acao: "Cobrar assinatura do contrato" },
  { padroes: ["vencido", "venceu", "vencida"], tipoPendencia: "Documento vencido", acao: "Cobrar atualização de documento vencido" },
  { padroes: ["banco", "financiamento"], tipoPendencia: "Pendência bancária/financiamento", acao: "Verificar andamento junto ao banco" },
  { padroes: ["pendente", "pendencia", "falta", "aguardando"], tipoPendencia: "Documentação pendente", acao: "Levantar e cobrar documentação pendente" },
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

  // 1) Inércia inicial: nem começou a ser tratada e o prazo já estourou.
  if (etapaNorm.startsWith("0.01") && slaStatus === "estourado") {
    return {
      chaveRegra: `${linha.numero}::inercia_inicial`,
      nivel: "operacional",
      quadro: praca,
      tipoPendencia: "Inércia inicial",
      descricao: `Preenchimento simultâneo em tela com o corretor AGORA. (pasta ${linha.numero})`,
    };
  }

  // 2) Qualificação: apontamento/restrição no nome do cliente — mais urgente que doc. de rotina.
  if (contemAlgumTermo(obsNorm, TERMOS_QUALIFICACAO)) {
    return {
      chaveRegra: `${linha.numero}::qualificacao`,
      nivel: "operacional",
      quadro: praca,
      tipoPendencia: "Qualificação / restrição",
      descricao: `Notificar imobiliária: Prazo 48h para envio de quitação. (pasta ${linha.numero})`,
    };
  }

  // 3) Documentação de rotina (IRPF, FGTS, RG, certidão, estado civil).
  for (const { termo, label } of TERMOS_DOCUMENTACAO) {
    if (contemAlgumTermo(obsNorm, [termo])) {
      const recorte = extrairRecorte(linha.observacao, termo);
      return {
        chaveRegra: `${linha.numero}::documentacao`,
        nivel: "operacional",
        quadro: praca,
        tipoPendencia: label,
        descricao: `Cobrar corretor: ${recorte}. (pasta ${linha.numero})`,
      };
    }
  }

  // 4) Fallback legado, para não perder cobertura de pendências fora dos 3 gatilhos acima.
  for (const regra of REGRAS_PENDENCIA_LEGADO) {
    if (regra.padroes.some((p) => obsNorm.includes(p))) {
      const imobiliaria = linha.responsavel || "imobiliária não informada";
      return {
        chaveRegra: `${linha.numero}::operacional`,
        nivel: "operacional",
        quadro: praca,
        tipoPendencia: regra.tipoPendencia,
        descricao: `Ligar para ${imobiliaria} - ${regra.acao} (pasta ${linha.numero}). SLA: ${SLA_ACAO_LABEL[slaStatus]}`,
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

  const cliente = linha.cpfCnpj ? `CPF/CNPJ ${linha.cpfCnpj}` : "cliente não identificado";
  return {
    chaveRegra: `${linha.numero}::risco_bancario`,
    nivel: "analitico",
    quadro: "analista",
    tipoPendencia: "Risco bancário",
    descricao: `Intervenção Manual: Acionar Caixa para destravar a pasta do ${cliente} (pasta ${linha.numero}).`,
  };
}

// ---------------------------------------------------------------------------
// Nível Tático por linha (Paulo) — Erro de Processo Básico
// ---------------------------------------------------------------------------

const PADROES_ERRO_PROCESSO = [/\bilegiv[ei]l/i, /\bcortes?\b/i, /mais de 10 anos/i, /nao renomeado/i];

export function gerarEspecErroProcesso(linha: LinhaPlanilha): EspecTarefaLinha | null {
  const obsNorm = normalize(linha.observacao);
  if (!PADROES_ERRO_PROCESSO.some((re) => re.test(obsNorm))) return null;

  const imobiliaria = linha.responsavel || "imobiliária não informada";
  return {
    chaveRegra: `${linha.numero}::erro_processo`,
    nivel: "tatico",
    quadro: "coordenador",
    tipoPendencia: "Erro de processo básico",
    descricao: `Agendar reciclagem do PRO VEND 01 com a Imobiliária ${imobiliaria}. (pasta ${linha.numero})`,
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
    especs.push({
      chaveRegra: `AGREGADO::gargalo::${normalize(cidade)}::${etapa.trim()}`,
      nivel: "analitico",
      quadro: "analista",
      cidade,
      etapa,
      imobiliaria: "",
      tipoPendencia: "Gargalo de etapa",
      descricao: `Gargalo detectado: ${grupo.length} pastas travadas na etapa ${etapa} em ${cidade}. Orientar a assistente responsável.`,
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

export function calcularEscalonamento(params: {
  quadro: Quadro;
  slaStatus: SlaStatus;
  falhouAuditoriaAgora: boolean;
}): QuadroEscalonamento[] {
  const { quadro, slaStatus, falhouAuditoriaAgora } = params;
  const escalonamento: QuadroEscalonamento[] = [];
  if ((slaStatus === "urgente" || slaStatus === "estourado") && quadro !== "coordenador") {
    escalonamento.push("coordenador");
  }
  if (falhouAuditoriaAgora && quadro !== "analista") {
    escalonamento.push("analista");
  }
  return escalonamento;
}
