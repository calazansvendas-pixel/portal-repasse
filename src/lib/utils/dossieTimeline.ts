import { notasDe } from "@/components/tarefas/partesCard";
import { formatDateTimeBR } from "@/lib/utils/dates";
import { calcularSlaStatus, SLA_BADGE_CLASSES, SLA_LABEL } from "@/lib/utils/sla";
import type { EtapaHistorico, NotaResolucao, Quadro, Registro, SlaStatus, Tarefa } from "@/lib/types";

export type TipoEventoDossie = "entrada" | "planilha" | "tarefa" | "acao";

export interface EventoDossie {
  tipo: TipoEventoDossie;
  data: string; // ISO (data ou data-hora) — a DATA REAL de criação/registro, nunca alterada
  titulo: string;
  detalhe?: string | null;
  autor?: string | null;
  badge?: { label: string; classes: string } | null;
  badges?: { label: string; classes: string }[];
  // 0 = marco de etapa/entrada; 1 = tarefa (ou nota dela) aninhada sob o marco que a disparou.
  nivel?: 0 | 1;
}

const BADGE_CONCLUIDA_CLASSES = SLA_BADGE_CLASSES.no_prazo;

/** Cargo do quadro-destino — nunca exibido sozinho: sempre acompanhado do nome real abaixo. */
const DESTINO_CARGO: Record<Quadro, string> = {
  laiza: "Assistente",
  eliane: "Assistente",
  catarina: "Assistente",
  coordenador: "Coordenação",
  analista: "Analista",
};
// Nome real da pessoa por trás do quadro (+ praça/cidade, para os assistentes regionais).
const DESTINO_NOME: Record<Quadro, string> = {
  laiza: "Layza (Serra)",
  eliane: "Eliane (Vila Velha)",
  catarina: "Catharina (Fátima e Camburi)",
  coordenador: "Paulo",
  analista: "Andressa",
};

/** "Assistente: Eliane (Vila Velha)" / "Analista: Andressa" / "Coordenação: Paulo". */
function responsavelLabel(praca: Quadro): string {
  return `${DESTINO_CARGO[praca]}: ${DESTINO_NOME[praca]}`;
}

/**
 * Título do nó: distingue uma entrada/SLA direta na praça regional (nível "operacional") de um
 * escalonamento para Coordenador/Analista (nível "analitico"/"tatico") — e, dentro do
 * escalonamento, identifica quando o gatilho foi estagnação (o nome da regra menciona o termo).
 */
function tituloTarefa(t: Tarefa): string {
  if (t.nivel === "operacional") return "Tarefa Atribuída";
  return /estagna/i.test(t.tipoPendencia) ? "Escalonamento por Estagnação" : "Escalonamento";
}

// A mensagem padrão de conclusão (tarefasService.ts) já cita o cargo de quem concluiu — quando a
// nota é a padrão (sem texto digitado), extraímos o cargo dali; senão caímos no cargo do próprio
// quadro-destino (só o dono do quadro marca a própria tarefa como feita — ver meuQuadroInterativo).
const CARGO_NA_MENSAGEM_PADRAO = /^Marcada como feita pel[ao] (Assistente|Analista|Coordenação|Gerência)\.$/;
function cargoDaConclusao(texto: string, praca: Quadro): string {
  const m = CARGO_NA_MENSAGEM_PADRAO.exec(texto.trim());
  return m ? m[1] : DESTINO_CARGO[praca];
}

function badgeSla(status: SlaStatus) {
  return { label: SLA_LABEL[status], classes: SLA_BADGE_CLASSES[status] };
}

/** Estouro de SLA na conclusão: compara a data em que a ação foi registrada contra o prazo vigente. */
function badgeConclusao(prazo: string | null | undefined, concluidaEm: string): { label: string; classes: string } | null {
  if (!prazo) return null;
  const status = calcularSlaStatus(prazo, new Date(concluidaEm));
  return status === "estourado"
    ? { label: "Concluída com atraso", classes: SLA_BADGE_CLASSES.estourado }
    : { label: "Concluída no prazo", classes: SLA_BADGE_CLASSES.no_prazo };
}

/** Badge de status da tarefa: sucesso (concluída) ou alerta/estourado (pendente, pela urgência atual). */
function badgeStatusTarefa(t: Tarefa, concluida: boolean, prazo: string | null | undefined): { label: string; classes: string } {
  if (concluida) return { label: "Concluída", classes: BADGE_CONCLUIDA_CLASSES };
  const urgencia = prazo ? calcularSlaStatus(prazo) : t.slaStatus;
  return { label: urgencia === "no_prazo" ? "Pendente" : `Pendente — ${SLA_LABEL[urgencia]}`, classes: SLA_BADGE_CLASSES[urgencia] };
}

/** "Tarefa gerada em:" / "Tarefa concluída em:" / "Status: Em aberto / Pendente" — linhas do ciclo de vida. */
function linhasCicloDeVida(t: Tarefa, concluida: boolean, ultimaNota: NotaResolucao | undefined): string[] {
  const linhas = [`Tarefa gerada em: ${formatDateTimeBR(t.criadoEm)}`];
  if (concluida && ultimaNota?.data) {
    const cargo = cargoDaConclusao(ultimaNota.texto, t.praca);
    linhas.push(
      ultimaNota.autor
        ? `Tarefa concluída em: ${formatDateTimeBR(ultimaNota.data)} por ${ultimaNota.autor} (${cargo})`
        : `Tarefa concluída em: ${formatDateTimeBR(ultimaNota.data)} (${cargo})`
    );
  } else {
    linhas.push("Status: Em aberto / Pendente");
  }
  return linhas;
}

interface GrupoEtapa {
  etapa: string;
  dataInicio: string;
  dias: number;
  status: SlaStatus;
}

/**
 * Colapsa os snapshots diários da planilha (um por importação, mesmo sem mudança de etapa) em um
 * nó por PERMANÊNCIA na etapa — só nasce um marco novo quando a etapa muda de fato.
 */
function agruparHistoricoEtapas(historico: EtapaHistorico[] | undefined): GrupoEtapa[] {
  const grupos: GrupoEtapa[] = [];
  for (const h of historico ?? []) {
    const atual = grupos[grupos.length - 1];
    if (atual && atual.etapa.trim() === h.etapa.trim()) {
      atual.dias += 1;
      atual.status = h.status;
    } else {
      grupos.push({ etapa: h.etapa, dataInicio: h.data, dias: 1, status: h.status });
    }
  }
  return grupos;
}

/** Nó de tarefa (nível 1) + um nó por nota registrada nela — sempre na data real de criação/nota. */
function construirEventosDaTarefa(t: Tarefa, registro: Registro & { numero: string }): EventoDossie[] {
  const prazo = t.dataLimite ?? t.prazoEtapa;
  // Tarefas agregadas (gargalo) guardam status/nota por cliente em `clientesEnvolvidos`, não no topo.
  const cliente = t.origem === "agregado" ? t.clientesEnvolvidos?.find((c) => c.numero === registro.numero) : undefined;
  const concluida = cliente ? cliente.concluido : t.status !== "pendente";
  const notas = cliente ? notasDe(cliente) : notasDe(t);
  const ultimaNota = notas[notas.length - 1];

  const eventos: EventoDossie[] = [
    {
      tipo: "tarefa",
      data: t.criadoEm,
      titulo: tituloTarefa(t),
      detalhe: [
        responsavelLabel(t.praca),
        ...linhasCicloDeVida(t, concluida, ultimaNota),
        `Gatilho: ${t.tipoPendencia}`,
        t.descricao,
      ]
        .filter(Boolean)
        .join("\n"),
      badges: [badgeStatusTarefa(t, concluida, prazo)],
      nivel: 1,
    },
  ];

  for (const n of notas) {
    if (!n.data) continue;
    const cargo = cargoDaConclusao(n.texto, t.praca);
    eventos.push({
      tipo: "acao",
      data: n.data,
      titulo: n.autor ? `Concluída por: ${n.autor} (${cargo})` : `Marcada como feita (${cargo})`,
      detalhe: n.texto,
      autor: n.autor ?? null,
      badge: badgeConclusao(prazo, n.data),
      nivel: 1,
    });
  }

  return eventos;
}

/** Índice do último grupo de etapa em vigor na data informada (grupos vêm em ordem cronológica). */
function grupoNoMomento(grupos: GrupoEtapa[], dataISO: string): number {
  const dataCurta = dataISO.slice(0, 10);
  let idx = -1;
  for (let i = 0; i < grupos.length; i++) {
    if (grupos[i].dataInicio <= dataCurta) idx = i;
    else break;
  }
  return idx;
}

/**
 * Monta a timeline HIERARQUICA do Dossiê: cada marco de mudança de etapa da planilha vem seguido,
 * imediatamente abaixo, das tarefas/escalonamentos que o motor abriu enquanto a pasta estava
 * naquela etapa (e das notas de conclusão de cada uma) — nunca todas as tarefas jogadas soltas no
 * fim da lista. A data de cada nó continua sendo a data real gravada no banco (criadoEm/nota), só a
 * POSIÇÃO na lista muda para refletir "sob qual etapa" a tarefa nasceu.
 */
export function montarLinhaDoTempo(registro: Registro & { numero: string }, tarefas: Tarefa[]): EventoDossie[] {
  const eventos: EventoDossie[] = [];

  if (registro.dataEntrada) {
    eventos.push({ tipo: "entrada", data: registro.dataEntrada, titulo: "Entrada na esteira", nivel: 0 });
  }

  const grupos = agruparHistoricoEtapas(registro.historicoEtapas);

  // Cada tarefa nasce "sob" o marco de etapa em vigor na data em que foi criada — nunca solta no fim.
  const porGrupo = new Map<number, EventoDossie[]>();
  const semGrupo: EventoDossie[] = [];
  for (const t of tarefas) {
    const doTarefa = construirEventosDaTarefa(t, registro);
    const idx = grupoNoMomento(grupos, t.criadoEm);
    if (idx === -1) {
      semGrupo.push(...doTarefa);
      continue;
    }
    porGrupo.set(idx, [...(porGrupo.get(idx) ?? []), ...doTarefa]);
  }

  // Tarefas anteriores a qualquer marco conhecido (planilha sem histórico ainda) ficam logo no topo.
  eventos.push(...semGrupo.sort((a, b) => a.data.localeCompare(b.data)));

  grupos.forEach((g, i) => {
    const ultimo = i === grupos.length - 1;
    eventos.push({
      tipo: "planilha",
      data: g.dataInicio,
      titulo: `Entrada na Etapa ${g.etapa}`,
      detalhe: ultimo ? `Permanece há ${g.dias} dia(s) nesta etapa.` : `Ficou ${g.dias} dia(s) nesta etapa.`,
      badge: badgeSla(g.status),
      nivel: 0,
    });
    eventos.push(...(porGrupo.get(i) ?? []).sort((a, b) => a.data.localeCompare(b.data)));
  });

  return eventos;
}
