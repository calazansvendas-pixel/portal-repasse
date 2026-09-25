import type { Firestore } from "firebase-admin/firestore";
import type { LinhaPlanilha } from "./parseSheet";
import {
  CICLOS_FOLLOW_UP,
  calcularEscalonamento,
  detectarFiltroRuim,
  detectarGargaloCredito,
  dentroDoCooldownInclusao,
  detectarGargalos,
  calcularProximaCobranca,
  ehEtapaCredito,
  ehEtapaFollowUp,
  ehEtapa080,
  ehEtapaInclusao,
  ehFimDeEsteira,
  gerarEspec080,
  gerarEspecFollowUp,
  MENSAGEM_FALHA_080,
  gerarEspecErroProcesso,
  gerarEspecOperacional,
  gerarEspecRiscoBancario,
} from "./taskRouter";
import { resolvePracaPorCidade } from "@/lib/auth/roles";
import { calcularSlaStatus } from "@/lib/utils/sla";
import { calcularDataLimiteAutomatica } from "@/lib/utils/prazos";
import type { ClienteEnvolvido, EtapaHistorico, Importacao, NivelTarefa, OrigemTarefa, Quadro, Registro, SlaStatus, Tarefa } from "@/lib/types";

// Teto de segurança: o documento do Firestore tem limite de 1 MB e cada tarefa copia o trajeto da pasta.
const MAX_ENTRADAS_HISTORICO = 400;
// Nas sub-tarefas de um gargalo (muitas pastas no mesmo documento) só as últimas entradas são copiadas.
const MAX_ENTRADAS_HISTORICO_CLIENTE = 20;

/**
 * Log diário: TODA importação estampa uma entrada no trajeto da pasta (etapa atual +
 * data da planilha), mesmo que a etapa não tenha mudado. Reenviar a planilha da mesma
 * data substitui a entrada daquele dia (sem duplicar) e a lista fica em ordem cronológica.
 */
function acumularHistorico(atual: EtapaHistorico[] | undefined, novo: EtapaHistorico | undefined): EtapaHistorico[] {
  const lista = atual ? [...atual] : [];
  if (!novo) return lista;
  const mesmoDia = lista.findIndex((h) => h.data === novo.data);
  if (mesmoDia >= 0) {
    lista[mesmoDia] = novo;
  } else {
    lista.push(novo);
    lista.sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0));
  }
  return lista.slice(-MAX_ENTRADAS_HISTORICO);
}

/**
 * Monta a lista de sub-tarefas (uma por pasta) de uma tarefa agregada,
 * preservando o check e o trajeto já acumulados das pastas que continuam no grupo.
 */
function montarClientesEnvolvidos(
  linhas: LinhaPlanilha[],
  anteriores: ClienteEnvolvido[] | undefined,
  importacaoId: string,
  historicoPorNumero: Map<string, EtapaHistorico[]>,
  // Gargalo persistente: nenhum cliente sai da lista por causa da planilha (só pelo check humano).
  persistente = false,
  linhasPorNumero?: Map<string, LinhaPlanilha>
): ClienteEnvolvido[] {
  const porNumero = new Map((anteriores ?? []).map((c) => [c.numero, c]));
  const atualizar = (l: LinhaPlanilha): ClienteEnvolvido => {
    const ant = porNumero.get(l.numero);
    const passo: EtapaHistorico = {
      etapa: l.etapa,
      data: importacaoId,
      observacao: l.observacao,
      status: calcularSlaStatus(l.prazoEtapa),
    };
    return {
      numero: l.numero,
      clienteNome: l.clienteNome,
      imobiliaria: l.responsavel,
      observacao: l.observacao,
      etapa: l.etapa,
      dataEntrada: l.dataEntrada,
      historicoEtapas: (historicoPorNumero.get(l.numero) ?? acumularHistorico(ant?.historicoEtapas, passo)).slice(
        -MAX_ENTRADAS_HISTORICO_CLIENTE
      ),
      concluido: ant?.concluido ?? false,
      ...(ant?.notaResolucao ? { notaResolucao: ant.notaResolucao } : {}),
    };
  };

  if (!persistente) return linhas.map(atualizar);

  // Quem já estava na lista continua (com os dados frescos, se a pasta ainda veio na planilha;
  // senão, como estava); pastas que passaram a fazer parte do grupo entram no fim.
  const doGrupo = new Map(linhas.map((l) => [l.numero, l]));
  const mantidos = (anteriores ?? []).map((ant) => {
    const l = doGrupo.get(ant.numero) ?? linhasPorNumero?.get(ant.numero);
    return l ? atualizar(l) : ant;
  });
  const jaNaLista = new Set(mantidos.map((c) => c.numero));
  return [...mantidos, ...linhas.filter((l) => !jaNaLista.has(l.numero)).map(atualizar)];
}

export interface ResumoImportacao {
  importacaoId: string;
  sheetName: string;
  totalLinhas: number;
  novos: number;
  atualizados: number;
  tarefasCriadas: number;
  tarefasValidadas: number;
  falhasAuditoria: number;
  pastasArquivadas: number; // pastas em fim de esteira (9.xx) arquivadas nesta importação
  semPraca: string[]; // números de pasta cuja cidade não bateu com nenhuma praça
}

// "audit_failed" entra como ativa para que a próxima importação continue
// atualizando/rastreando a mesma tarefa em vez de criar um card duplicado.
const ATIVAS: Tarefa["status"][] = ["pendente", "pending_validation", "audit_failed"];
const FIRESTORE_BATCH_LIMIT = 450; // margem de segurança abaixo do limite de 500 do Firestore

interface DadosParaReconciliar {
  chaveRegra: string;
  origem: OrigemTarefa;
  nivel: NivelTarefa;
  numero: string | null;
  numerosRelacionados?: string[];
  clienteNome?: string | null;
  dataEntrada?: string | null;
  // Trajeto completo da pasta já acumulado na base (origem "linha" apenas —
  // agregados não têm uma única pasta/etapa a rastrear).
  historicoPasta?: EtapaHistorico[];
  // Tarefas agregadas: as pastas do grupo, cada uma com o próprio check.
  clientesEnvolvidos?: ClienteEnvolvido[];
  cicloFollowUp?: number; // etapa 0.04: ciclo (1 a 4) da régua
  // O responsável pode mudar entre importações enquanto a tarefa segue aberta (0.80: a observação
  // passa a conter — ou deixa de conter — pendência complexa).
  reroteavel?: boolean;
  cidade: string;
  quadro: Quadro;
  imobiliaria: string;
  etapa: string;
  prazoEtapa: string | null;
  slaStatus: SlaStatus;
  tipoPendencia: string;
  descricao: string;
  observacaoOriginal: string;
  // Pasta em fim de esteira (9.xx): tarefas abertas são encerradas com sucesso.
  fimDeEsteira?: boolean;
  // A regra ainda dispara nesta importação (linha ainda tem o gatilho, ou o
  // agregado ainda atinge o limiar)?
  condicaoAtiva: boolean;
  // Sinal de progresso: para tarefas de linha, "a etapa da pasta avançou";
  // para agregados, sempre true (não há uma única etapa para comparar — o
  // critério de sucesso vira simplesmente "o agregado deixou de disparar").
  avancoDetectado: boolean;
}

/**
 * Motor de auditoria diária ("Daily Delta") em cascata: compara a planilha
 * recém-importada com o estado atual de cada pasta e reconcilia, para CADA
 * regra de cada nível hierárquico (operacional/analítico/tático, por linha ou
 * agregada), o card correspondente:
 *  - cria a tarefa quando o gatilho passa a valer e não havia tarefa ativa;
 *  - valida ('validated_done') tarefas marcadas como resolvidas quando o
 *    sinal de progresso confirma e o gatilho não dispara mais;
 *  - devolve ao quadro com tag de "Falha de Auditoria" quando a marcação foi
 *    "fake done" (escalando também para o quadro da Analista);
 *  - atualiza o snapshot de cada pasta e grava o histórico do dia.
 */
export async function executarAuditoriaDiaria(params: {
  db: Firestore;
  linhas: LinhaPlanilha[];
  sheetName: string;
  importacaoId: string; // yyyy-MM-dd
  nomeArquivo: string;
  importadoPor: string;
}): Promise<ResumoImportacao> {
  const { db, linhas, sheetName, importacaoId, nomeArquivo, importadoPor } = params;
  const agora = new Date().toISOString();

  const registrosRefs = linhas.map((l) => db.collection("registros").doc(l.numero));
  const registrosSnaps = registrosRefs.length ? await db.getAll(...registrosRefs) : [];
  const registrosAntigos = new Map<string, Registro>();
  registrosSnaps.forEach((snap) => {
    if (snap.exists) registrosAntigos.set(snap.id, snap.data() as Registro);
  });

  // Vários uploads no mesmo dia SOMAM no resumo da importação (não sobrescrevem o anterior).
  const importacaoRef = db.collection("importacoes").doc(importacaoId);
  const [importacaoDoDiaSnap] = await db.getAll(importacaoRef);
  const doDia = importacaoDoDiaSnap.exists ? (importacaoDoDiaSnap.data() as Partial<Importacao>) : null;

  const tarefasAtivasSnap = await db.collection("tarefas").where("status", "in", ATIVAS).get();
  const tarefasPorChave = new Map<string, { id: string; data: Tarefa }>();
  tarefasAtivasSnap.forEach((doc) => {
    const data = doc.data() as Tarefa;
    tarefasPorChave.set(data.chaveRegra, { id: doc.id, data });
  });

  // Janela de respiro da 0.01: última conclusão recente por chaveRegra de "Inércia inicial".
  // Consulta só por resolvidoEm (índice automático de campo único) e filtra o resto em memória.
  const corteCooldown = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const concluidasRecentesSnap = await db.collection("tarefas").where("resolvidoEm", ">=", corteCooldown).get();
  const ultimaConclusaoInercia = new Map<string, string>();
  concluidasRecentesSnap.forEach((doc) => {
    const t = doc.data() as Tarefa;
    if (!t.chaveRegra.endsWith("::inercia_inicial") || !t.resolvidoEm) return;
    const atual = ultimaConclusaoInercia.get(t.chaveRegra);
    if (!atual || t.resolvidoEm > atual) ultimaConclusaoInercia.set(t.chaveRegra, t.resolvidoEm);
  });

  const resumo: ResumoImportacao = {
    importacaoId,
    sheetName,
    totalLinhas: linhas.length,
    novos: 0,
    atualizados: 0,
    tarefasCriadas: 0,
    tarefasValidadas: 0,
    falhasAuditoria: 0,
    pastasArquivadas: 0,
    semPraca: [],
  };

  let batch = db.batch();
  let opsNoBatchAtual = 0;
  const batches: FirebaseFirestore.WriteBatch[] = [];

  function proximoBatchSeNecessario() {
    if (opsNoBatchAtual >= FIRESTORE_BATCH_LIMIT) {
      batches.push(batch);
      batch = db.batch();
      opsNoBatchAtual = 0;
    }
  }
  function set(ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData, merge = true) {
    proximoBatchSeNecessario();
    batch.set(ref, data, { merge });
    opsNoBatchAtual++;
  }
  function update(ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    proximoBatchSeNecessario();
    batch.update(ref, data);
    opsNoBatchAtual++;
  }

  function reconciliarTarefa(dados: DadosParaReconciliar) {
    const tarefaAtiva = tarefasPorChave.get(dados.chaveRegra);

    if (tarefaAtiva?.data.status === "pending_validation") {
      const tarefaRef = db.collection("tarefas").doc(tarefaAtiva.id);
      // Exceção de confiança: a virada da etapa 0.01 não depende das
      // assistentes, então o check delas vale mesmo se a etapa não avançou —
      // nunca gera Falha de Auditoria para tarefas operacionais da 0.01.
      const confiancaEtapaInclusao =
        dados.nivel === "operacional" &&
        ehEtapaInclusao(tarefaAtiva.data.etapaNoMomentoResolucao ?? tarefaAtiva.data.etapa);
      // Mesma confiança no clique para o gargalo de Crédito (0.99): quem aguarda
      // é o setor de Crédito, não o Coordenador — a baixa vale mesmo com as pastas na 0.99.
      const confiancaCredito = dados.chaveRegra.startsWith("AGREGADO::gargalo_credito::");
      // E na 0.04 (follow-up): a virada também não depende da equipe interna.
      const ehFollowUp = dados.chaveRegra.endsWith("::follow_up_004");
      const sucesso =
        confiancaEtapaInclusao ||
        confiancaCredito ||
        ehFollowUp ||
        dados.fimDeEsteira === true ||
        (dados.avancoDetectado && !dados.condicaoAtiva);

      if (sucesso) {
        update(tarefaRef, {
          status: "validated_done",
          atualizadoEm: agora,
          historicoEtapas: dados.historicoPasta ?? tarefaAtiva.data.historicoEtapas ?? [],
        });
        resumo.tarefasValidadas++;
        if (ehFollowUp && dados.numero) {
          // Régua: registra a conclusão na pasta e libera a próxima cobrança (10/20/30 dias após a baixa).
          const ciclos = (registrosAntigos.get(dados.numero)?.ciclosFollowUp004 ?? 0) + 1;
          set(db.collection("registros").doc(dados.numero), {
            ciclosFollowUp004: ciclos,
            dataProximaCobranca: calcularProximaCobranca(importacaoId, ciclos),
          });
        }
      } else {
        // "Fake done": marcada como resolvida, mas o gatilho continua valendo.
        update(tarefaRef, {
          status: "audit_failed",
          atualizadoEm: agora,
          historicoEtapas: dados.historicoPasta ?? tarefaAtiva.data.historicoEtapas ?? [],
          // Falha em tarefa agregada: as sub-tarefas voltam a ficar sem check para refazer.
          ...(tarefaAtiva.data.clientesEnvolvidos?.length
            ? { clientesEnvolvidos: (dados.clientesEnvolvidos ?? tarefaAtiva.data.clientesEnvolvidos).map((c) => ({ ...c, concluido: false })) }
            : {}),
          falhaAuditoriaMotivo:
            dados.origem === "linha" && ehEtapa080(dados.etapa)
              ? MENSAGEM_FALHA_080
              : dados.avancoDetectado
                ? "Avançou, mas a mesma pendência foi identificada novamente."
                : "Continua na mesma situação da última importação.",
          falhaAuditoriaEm: agora,
          escalonadoPara: calcularEscalonamento({
            quadro: dados.quadro,
            falhouAuditoriaAgora: true,
          }),
        });
        const notifRef = db.collection("notificacoes").doc();
        set(
          notifRef,
          {
            tipo: "falha_auditoria",
            tarefaId: tarefaAtiva.id,
            numero: dados.numero ?? "",
            mensagem: `Falha de auditoria em "${dados.tipoPendencia}"${dados.numero ? ` (pasta ${dados.numero})` : ""}: marcada como resolvida, mas a pendência persiste.`,
            destinatariosRoles: ["gerencia", "analista"],
            criadoEm: agora,
            lida: false,
          },
          false
        );
        resumo.falhasAuditoria++;
      }
      return;
    }

    if (tarefaAtiva?.data.status === "pendente" || tarefaAtiva?.data.status === "audit_failed") {
      const tarefaRef = db.collection("tarefas").doc(tarefaAtiva.id);
      if (!dados.condicaoAtiva) {
        // O gatilho deixou de valer sem passar por validação manual: fecha silenciosamente.
        update(tarefaRef, { status: "validated_done", atualizadoEm: agora });
        resumo.tarefasValidadas++;
      } else {
        update(tarefaRef, {
          cidade: dados.cidade,
          etapa: dados.etapa,
          prazoEtapa: dados.prazoEtapa,
          slaStatus: dados.slaStatus,
          imobiliaria: dados.imobiliaria,
          tipoPendencia: dados.tipoPendencia,
          ...(dados.reroteavel ? { praca: dados.quadro, nivel: dados.nivel } : {}),
          // Se a Gerência reescreveu o texto, a importação não o sobrescreve.
          descricao: tarefaAtiva.data.descricaoEditada ? tarefaAtiva.data.descricao : dados.descricao,
          observacaoOriginal: dados.observacaoOriginal,
          numerosRelacionados: dados.numerosRelacionados ?? null,
          ...(dados.clientesEnvolvidos ? { clientesEnvolvidos: dados.clientesEnvolvidos } : {}),
          clienteNome: dados.clienteNome ?? null,
          dataEntrada: dados.dataEntrada ?? null,
          historicoEtapas: dados.historicoPasta ?? tarefaAtiva.data.historicoEtapas ?? [],
          atualizadoEm: agora,
          escalonadoPara: calcularEscalonamento({
            quadro: dados.quadro,
            falhouAuditoriaAgora: tarefaAtiva.data.status === "audit_failed",
          }),
        });
      }
      return;
    }

    const ultimaConclusao = ultimaConclusaoInercia.get(dados.chaveRegra);
    const emCooldown = ultimaConclusao ? dentroDoCooldownInclusao(importacaoId, ultimaConclusao) : false;

    if (!tarefaAtiva && dados.condicaoAtiva && !emCooldown) {
      const ref = db.collection("tarefas").doc();
      const tarefa: Omit<Tarefa, "id"> = {
        chaveRegra: dados.chaveRegra,
        origem: dados.origem,
        nivel: dados.nivel,
        importacaoIdCriacao: importacaoId,
        numero: dados.numero,
        numerosRelacionados: dados.numerosRelacionados ?? null,
        clienteNome: dados.clienteNome ?? null,
        dataEntrada: dados.dataEntrada ?? null,
        cidade: dados.cidade,
        praca: dados.quadro,
        imobiliaria: dados.imobiliaria,
        etapa: dados.etapa,
        prazoEtapa: dados.prazoEtapa,
        slaStatus: dados.slaStatus,
        tipoPendencia: dados.tipoPendencia,
        descricao: dados.descricao,
        observacaoOriginal: dados.observacaoOriginal,
        status: "pendente",
        criadoEm: agora,
        atualizadoEm: agora,
        resolvidoPor: null,
        resolvidoEm: null,
        etapaNoMomentoResolucao: null,
        observacaoNoMomentoResolucao: null,
        falhaAuditoriaMotivo: null,
        falhaAuditoriaEm: null,
        escalonadoPara: calcularEscalonamento({
          quadro: dados.quadro,
          falhouAuditoriaAgora: false,
        }),
        historicoEtapas: dados.historicoPasta ?? [],
        clientesEnvolvidos: dados.clientesEnvolvidos ?? [],
        cicloFollowUp: dados.cicloFollowUp ?? null,
        dataLimite: calcularDataLimiteAutomatica({
          base: importacaoId,
          slaStatus: dados.slaStatus,
          prazoEtapa: dados.prazoEtapa,
          agregadoDiasUteis:
            dados.origem === "agregado" ? (dados.chaveRegra.startsWith("AGREGADO::filtro_ruim::") ? 5 : 2) : undefined,
        }),
      };
      set(ref, tarefa, false);
      resumo.tarefasCriadas++;
    }
  }

  // --- Passo 1: reconcilia as regras de LINHA (uma por pasta importada) ---
  const historicoPorNumero = new Map<string, EtapaHistorico[]>();
  for (const linha of linhas) {
    const antigo = registrosAntigos.get(linha.numero) ?? null;
    const slaStatus = calcularSlaStatus(linha.prazoEtapa);
    const praca = resolvePracaPorCidade(linha.cidade);
    if (!praca) resumo.semPraca.push(linha.numero);
    const etapaAvancou = antigo ? antigo.etapa !== linha.etapa : false;

    const registroRef = db.collection("registros").doc(linha.numero);
    const snapshotRef = registroRef.collection("snapshots").doc(importacaoId);
    set(snapshotRef, { ...linha, importacaoId, importadoEm: agora }, false);

    const fimDeEsteira = ehFimDeEsteira(linha.etapa);
    if (fimDeEsteira) resumo.pastasArquivadas++;

    // Trajeto da pasta: parte do que já está na base e só EMENDA um salto quando a etapa muda
    // (registros antigos, sem histórico, são semeados com a etapa que já tinham).
    const passoAtual: EtapaHistorico = {
      etapa: linha.etapa,
      data: importacaoId,
      observacao: linha.observacao,
      status: slaStatus,
    };
    const historicoBase: EtapaHistorico[] =
      antigo?.historicoEtapas ??
      (antigo
        ? [
            {
              etapa: antigo.etapa,
              data: (antigo.criadoEm ?? importacaoId).slice(0, 10),
              observacao: antigo.observacao,
              status: antigo.slaStatus,
            },
          ]
        : []);
    const historicoPasta = acumularHistorico(historicoBase, passoAtual);
    historicoPorNumero.set(linha.numero, historicoPasta);

    const registroPayload = {
      numero: linha.numero,
      clienteNome: linha.clienteNome,
      dataEntrada: linha.dataEntrada,
      historicoEtapas: historicoPasta,
      cpfCnpj: linha.cpfCnpj,
      cidade: linha.cidade,
      responsavel: linha.responsavel,
      etapa: linha.etapa,
      prazoEtapa: linha.prazoEtapa,
      observacao: linha.observacao,
      slaStatus,
      atualizadoEm: agora,
      etapaAnterior: antigo?.etapa ?? null,
      observacaoAnterior: antigo?.observacao ?? null,
      arquivada: fimDeEsteira,
      arquivadaEm: fimDeEsteira ? (antigo?.arquivadaEm ?? agora) : null,
    };

    if (!antigo) {
      resumo.novos++;
      set(registroRef, { ...registroPayload, criadoEm: agora });
    } else {
      resumo.atualizados++;
      set(registroRef, registroPayload);
    }

    const camposComuns = {
      origem: "linha" as const,
      numero: linha.numero,
      clienteNome: linha.clienteNome,
      dataEntrada: linha.dataEntrada,
      historicoPasta,
      cidade: linha.cidade,
      imobiliaria: linha.responsavel,
      etapa: linha.etapa,
      prazoEtapa: linha.prazoEtapa,
      slaStatus,
      observacaoOriginal: linha.observacao,
      avancoDetectado: etapaAvancou,
    };

    // Fim de esteira: encerra qualquer tarefa aberta da pasta e não gera novas.
    if (fimDeEsteira) {
      for (const [chave, t] of tarefasPorChave) {
        if (t.data.numero !== linha.numero) continue;
        reconciliarTarefa({
          ...camposComuns,
          chaveRegra: chave,
          nivel: t.data.nivel,
          quadro: t.data.praca,
          tipoPendencia: t.data.tipoPendencia,
          descricao: t.data.descricao,
          condicaoAtiva: false,
          fimDeEsteira: true,
        });
      }
      continue;
    }

    // Nível Operacional (Laiza/Eliane/Catarina). Regras por etapa:
    //  - 0.04: régua de follow-up (só nasce novo ciclo quando a data de próxima cobrança chega;
    //    após a 4ª conclusão o ciclo se encerra);
    //  - 0.99: nenhuma tarefa individual (gargalo do Coordenador);
    //  - demais: gatilhos operacionais comuns.
    // Cada pasta mantém no máximo UMA tarefa operacional aberta: se a regra vigente mudou (ou
    // deixou de valer), a tarefa antiga não fica órfã nem duplicada — recebe baixa antes de a
    // nova nascer (continuidade entre planilhas).
    const emFollowUp = ehEtapaFollowUp(linha.etapa);
    const em080 = ehEtapa080(linha.etapa);
    // 0.80: uma tarefa por pasta, roteada pela observação (Analista x Assistente da praça).
    const spec080 = em080 ? gerarEspec080(linha, praca) : null;
    const specComum =
      praca && !emFollowUp && !em080 && !ehEtapaCredito(linha.etapa)
        ? gerarEspecOperacional(linha, praca, slaStatus)
        : null;
    const chaveOperacionalDesejada =
      praca && emFollowUp ? `${linha.numero}::follow_up_004` : (spec080?.chaveRegra ?? specComum?.chaveRegra ?? null);

    // Órfãs: a baixa só vale se a ETAPA avançou (camposComuns.avancoDetectado). Se a pasta continua
    // na mesma etapa, uma tarefa clicada cujo gatilho mudou volta como Falha de Auditoria.
    for (const [chave, t] of tarefasPorChave) {
      const ehDaPasta = t.data.numero === linha.numero;
      const ehDaRegraOperacional = t.data.nivel === "operacional" || chave.endsWith("::etapa_080");
      if (!ehDaPasta || !ehDaRegraOperacional || chave === chaveOperacionalDesejada) continue;
      reconciliarTarefa({
        ...camposComuns,
        chaveRegra: chave,
        nivel: t.data.nivel,
        quadro: t.data.praca,
        tipoPendencia: t.data.tipoPendencia,
        descricao: t.data.descricao,
        condicaoAtiva: false,
      });
    }

    if (praca && emFollowUp) {
      const ciclosFeitos = antigo?.ciclosFollowUp004 ?? 0;
      const proxima = antigo?.dataProximaCobranca ?? null;
      const liberado = !proxima || importacaoId >= proxima;
      const chave = `${linha.numero}::follow_up_004`;
      const emAndamento = tarefasPorChave.has(chave);
      const encerrado = ciclosFeitos >= CICLOS_FOLLOW_UP;
      const spec = gerarEspecFollowUp(linha, praca, ciclosFeitos + 1);
      reconciliarTarefa({
        ...camposComuns,
        chaveRegra: chave,
        nivel: "operacional",
        quadro: praca,
        tipoPendencia: spec.tipoPendencia,
        descricao: spec.descricao,
        cicloFollowUp: ciclosFeitos + 1,
        condicaoAtiva: !encerrado && (emAndamento || liberado),
      });
    } else if (spec080) {
      reconciliarTarefa({
        ...camposComuns,
        chaveRegra: spec080.chaveRegra,
        nivel: spec080.nivel,
        quadro: spec080.quadro,
        tipoPendencia: spec080.tipoPendencia,
        descricao: spec080.descricao,
        condicaoAtiva: true,
        reroteavel: true,
      });
    } else if (praca && specComum) {
      reconciliarTarefa({
        ...camposComuns,
        chaveRegra: specComum.chaveRegra,
        nivel: "operacional",
        quadro: praca,
        tipoPendencia: specComum.tipoPendencia,
        descricao: specComum.descricao,
        condicaoAtiva: true,
      });
    }

    // Nível Analítico por linha (Andressa) — Risco Bancário.
    const specRisco = gerarEspecRiscoBancario(linha);
    reconciliarTarefa({
      ...camposComuns,
      chaveRegra: specRisco?.chaveRegra ?? `${linha.numero}::risco_bancario`,
      nivel: "analitico",
      quadro: "analista",
      tipoPendencia: specRisco?.tipoPendencia ?? "",
      descricao: specRisco?.descricao ?? "",
      condicaoAtiva: specRisco !== null,
    });

    // Nível Tático por linha (Paulo) — Erro de Processo Básico.
    const specErro = gerarEspecErroProcesso(linha);
    reconciliarTarefa({
      ...camposComuns,
      chaveRegra: specErro?.chaveRegra ?? `${linha.numero}::erro_processo`,
      nivel: "tatico",
      quadro: "coordenador",
      tipoPendencia: specErro?.tipoPendencia ?? "",
      descricao: specErro?.descricao ?? "",
      condicaoAtiva: specErro !== null,
    });
  }

  // --- Passo 2: reconcilia os AGREGADOS (cruzam várias linhas da mesma importação) ---
  // Pastas arquivadas (9.xx) não entram em gargalos nem em filtros de qualificação.
  const linhasEmEsteira = linhas.filter((l) => !ehFimDeEsteira(l.etapa));
  const linhasPorNumero = new Map(linhas.map((l) => [l.numero, l]));
  const paramsAgregados = { tarefasPorChave, reconciliarTarefa, importacaoId, historicoPorNumero, linhasPorNumero };
  reconciliarAgregados({
    especsAtuais: detectarGargalos(linhasEmEsteira),
    prefixoChave: "AGREGADO::gargalo::",
    ...paramsAgregados,
  });
  reconciliarAgregados({
    especsAtuais: detectarGargaloCredito(linhasEmEsteira),
    prefixoChave: "AGREGADO::gargalo_credito::",
    ...paramsAgregados,
  });
  reconciliarAgregados({
    especsAtuais: detectarFiltroRuim(linhasEmEsteira),
    prefixoChave: "AGREGADO::filtro_ruim::",
    ...paramsAgregados,
  });

  // Tarefas avulsas não têm evidência na planilha: o check de quem concluiu vale
  // e a próxima importação apenas as arquiva (validated_done).
  for (const { id, data } of tarefasPorChave.values()) {
    if (data.origem === "manual" && data.status === "pending_validation") {
      update(db.collection("tarefas").doc(id), { status: "validated_done", atualizadoEm: agora });
      resumo.tarefasValidadas++;
    }
  }

  batches.push(batch);

  const ultimoBatch = batches[batches.length - 1];
  ultimoBatch.set(importacaoRef, {
    id: importacaoId,
    nomeArquivo: doDia?.nomeArquivo && doDia.nomeArquivo !== nomeArquivo ? `${doDia.nomeArquivo}; ${nomeArquivo}` : nomeArquivo,
    importadoPor,
    importadoEm: agora,
    totalRegistros: (doDia?.totalRegistros ?? 0) + resumo.totalLinhas,
    novos: (doDia?.novos ?? 0) + resumo.novos,
    atualizados: (doDia?.atualizados ?? 0) + resumo.atualizados,
    tarefasCriadas: (doDia?.tarefasCriadas ?? 0) + resumo.tarefasCriadas,
    tarefasValidadas: (doDia?.tarefasValidadas ?? 0) + resumo.tarefasValidadas,
    falhasAuditoria: (doDia?.falhasAuditoria ?? 0) + resumo.falhasAuditoria,
    pastasArquivadas: (doDia?.pastasArquivadas ?? 0) + resumo.pastasArquivadas,
  });

  for (const b of batches) {
    await b.commit();
  }

  return resumo;
}

/**
 * Reconcilia tarefas de origem agregada: cria/atualiza as que ainda disparam
 * (`especsAtuais`) e fecha as que existiam mas o grupo deixou de atingir o
 * limiar nesta importação (não aparecem mais em `especsAtuais`).
 */
function reconciliarAgregados(params: {
  especsAtuais: ReturnType<typeof detectarGargalos>;
  prefixoChave: string;
  tarefasPorChave: Map<string, { id: string; data: Tarefa }>;
  reconciliarTarefa: (dados: DadosParaReconciliar) => void;
  importacaoId: string;
  historicoPorNumero: Map<string, EtapaHistorico[]>;
  linhasPorNumero: Map<string, LinhaPlanilha>;
}) {
  const { especsAtuais, prefixoChave, tarefasPorChave, reconciliarTarefa, importacaoId, historicoPorNumero, linhasPorNumero } =
    params;
  const chavesAtuais = new Set(especsAtuais.map((e) => e.chaveRegra));
  // Gargalos (0.99 e o genérico) são persistentes: depois de criados, a planilha não remove clientes
  // nem dissolve a tarefa se o número de pastas cair abaixo do gatilho — só o check humano tira o cliente.
  const persistente = prefixoChave === "AGREGADO::gargalo::" || prefixoChave === "AGREGADO::gargalo_credito::";

  for (const spec of especsAtuais) {
    const clientesEnvolvidos = montarClientesEnvolvidos(
      spec.linhas,
      tarefasPorChave.get(spec.chaveRegra)?.data.clientesEnvolvidos,
      importacaoId,
      historicoPorNumero,
      persistente,
      linhasPorNumero
    );
    reconciliarTarefa({
      chaveRegra: spec.chaveRegra,
      origem: "agregado",
      nivel: spec.nivel,
      numero: null,
      numerosRelacionados: persistente ? clientesEnvolvidos.map((c) => c.numero) : spec.numerosRelacionados,
      clientesEnvolvidos,
      cidade: spec.cidade,
      quadro: spec.quadro,
      imobiliaria: spec.imobiliaria,
      etapa: spec.etapa,
      prazoEtapa: null,
      slaStatus: "no_prazo",
      tipoPendencia: spec.tipoPendencia,
      descricao: spec.descricao,
      observacaoOriginal: "",
      condicaoAtiva: true,
      avancoDetectado: true,
    });
  }

  for (const [chave, tarefa] of tarefasPorChave) {
    if (!chave.startsWith(prefixoChave) || chavesAtuais.has(chave)) continue;

    if (persistente && tarefa.data.status !== "pending_validation") {
      // O gatilho deixou de valer, mas o gargalo segue aberto com os mesmos clientes (só atualiza os
      // dados das pastas que ainda vieram na planilha). Só o check de cada cliente o encerra.
      const clientesEnvolvidos = montarClientesEnvolvidos(
        [],
        tarefa.data.clientesEnvolvidos,
        importacaoId,
        historicoPorNumero,
        true,
        linhasPorNumero
      );
      reconciliarTarefa({
        chaveRegra: chave,
        origem: "agregado",
        nivel: tarefa.data.nivel,
        numero: null,
        numerosRelacionados: clientesEnvolvidos.map((c) => c.numero),
        clientesEnvolvidos,
        cidade: tarefa.data.cidade,
        quadro: tarefa.data.praca,
        imobiliaria: tarefa.data.imobiliaria,
        etapa: tarefa.data.etapa,
        prazoEtapa: null,
        slaStatus: tarefa.data.slaStatus,
        tipoPendencia: tarefa.data.tipoPendencia,
        descricao: tarefa.data.descricao,
        observacaoOriginal: "",
        condicaoAtiva: true,
        avancoDetectado: true,
      });
      continue;
    }

    reconciliarTarefa({
      chaveRegra: chave,
      origem: "agregado",
      nivel: tarefa.data.nivel,
      numero: null,
      numerosRelacionados: tarefa.data.numerosRelacionados ?? [],
      cidade: tarefa.data.cidade,
      quadro: tarefa.data.praca,
      imobiliaria: tarefa.data.imobiliaria,
      etapa: tarefa.data.etapa,
      prazoEtapa: null,
      slaStatus: tarefa.data.slaStatus,
      tipoPendencia: tarefa.data.tipoPendencia,
      descricao: tarefa.data.descricao,
      observacaoOriginal: "",
      condicaoAtiva: false,
      avancoDetectado: true,
    });
  }
}
