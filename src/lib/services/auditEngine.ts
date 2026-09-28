import type { Firestore } from "firebase-admin/firestore";
import type { LinhaPlanilha } from "./parseSheet";
import { ehFimDeEsteira } from "./taskRouter";
import { resolvePracaPorCidade } from "@/lib/auth/roles";
import { calcularSlaStatus } from "@/lib/utils/sla";
import { calcularDataLimiteAutomatica } from "@/lib/utils/prazos";
import {
  avaliarRegrasAgregadasDinamicas,
  avaliarRegrasDeTarefas,
  avaliarRegrasPorLinha,
  buscarRegrasAtivas,
} from "./dynamicRuleEngine";
import { NIVEL_POR_QUADRO } from "@/lib/server/tarefasManuais";
import type { ClienteEnvolvido, EtapaHistorico, Importacao, NivelTarefa, OrigemTarefa, Quadro, Registro, SlaStatus, Tarefa } from "@/lib/types";

// Teto de segurança: o documento do Firestore tem limite de 1 MB e cada tarefa copia o trajeto da pasta.
const MAX_ENTRADAS_HISTORICO = 400;

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

// Regras que exigem uma ação tática/analítica real da equipe (ligar para um setor externo, agendar
// visita/treinamento com a imobiliária) — a planilha não tem como confirmar isso, então um texto que
// muda ou desaparece na próxima importação NÃO prova que a ação aconteceu. A importação NUNCA pode
// arquivar, auto-resolver ou devolver por falha de auditoria essas tarefas sozinha: só fecham quando
// alguém clica em "Concluir".
const SUFIXOS_ACAO_HUMANA = [
  "::erro_processo", // Coordenador: agendar visita de relacionamento/treinamento com a imobiliária
  "::risco_bancario", // Analista: acionar a Caixa para destravar a pasta
];
// Agregados cuja chave varia por imobiliária (não dá para usar endsWith com sufixo fixo).
const PREFIXOS_ACAO_HUMANA = [
  "AGREGADO::filtro_ruim::", // Coordenador: alinhar a régua MCMV com a imobiliária
];

function ehTarefaDeAcaoHumana(chaveRegra: string): boolean {
  return (
    SUFIXOS_ACAO_HUMANA.some((sufixo) => chaveRegra.endsWith(sufixo)) ||
    PREFIXOS_ACAO_HUMANA.some((prefixo) => chaveRegra.startsWith(prefixo))
  );
}
const FIRESTORE_BATCH_LIMIT = 450; // margem de segurança abaixo do limite de 500 do Firestore

interface DadosParaReconciliar {
  chaveRegra: string;
  origem: OrigemTarefa;
  nivel: NivelTarefa;
  numero: string | null;
  numerosRelacionados?: string[];
  // Nomes dos clientes de numerosRelacionados, na mesma ordem — só para exibição direta no card.
  nomesRelacionados?: string[];
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
  // A regra ainda dispara nesta importação (linha ainda tem o gatilho, ou o
  // agregado ainda atinge o limiar)?
  condicaoAtiva: boolean;
}

/**
 * Motor de auditoria diária ("Daily Delta"): compara a planilha recém-importada com o estado
 * atual de cada pasta, atualiza registro/snapshot/histórico, e reconcilia CADA regra ATIVA
 * cadastrada em `regras_auditoria` (Motor de Regras Dinâmicas — ver dynamicRuleEngine.ts) contra
 * a importação. Sem nenhuma regra ativa, a importação não cria nenhuma tarefa nova — toda a
 * geração de tarefa vem só daí, nada é mais gerado por lógica fixa no código:
 *  - cria a tarefa quando o gatilho passa a valer e não havia tarefa ativa;
 *  - valida ('validated_done') QUALQUER tarefa marcada como resolvida — o clique de quem
 *    concluiu vale sempre; a importação nunca reabre uma tarefa concluída nem gera "Falha de
 *    Auditoria" (decisão de produto: menos ruído no Kanban, confia-se no usuário; se a pendência
 *    persistir, quem cobra é o SLA/estagnação normal, não uma reabertura automática);
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

  // Motor de Regras Dinâmicas (No-Code): busca as regras ativas cadastradas pela Gerência — a
  // ÚNICA fonte de geração de tarefa nesta importação (ver Passo 1, 2 e 3 abaixo). Sem regra
  // ativa nenhuma, a lista vem vazia e nenhuma tarefa nova nasce.
  const regrasDinamicasAtivas = await buscarRegrasAtivas(db);

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

  // Mesma blindagem de ação humana, agora incluindo regras dinâmicas com `exigeAcaoHumana`.
  // Limitação: se a regra for desativada ou excluída, essa proteção some retroativamente para
  // as tarefas dela que ainda estejam abertas — evite apagar uma regra dessas com tarefa em aberto.
  function chaveExigeAcaoHumana(chaveRegra: string): boolean {
    if (ehTarefaDeAcaoHumana(chaveRegra)) return true;
    const idDaRegra = /^DINAMICA::([^:]+)::/.exec(chaveRegra)?.[1];
    if (!idDaRegra) return false;
    return regrasDinamicasAtivas.some((r) => r.id === idDaRegra && r.exigeAcaoHumana);
  }

  function reconciliarTarefa(dados: DadosParaReconciliar) {
    const tarefaAtiva = tarefasPorChave.get(dados.chaveRegra);

    if (tarefaAtiva?.data.status === "pending_validation") {
      // Decisão de produto: o clique de quem marcou a tarefa como resolvida vale sempre — a
      // importação NUNCA reabre uma tarefa concluída nem gera "Falha de Auditoria", mesmo que a
      // pasta continue aparecendo na mesma etapa na planilha seguinte. As regras normais de
      // SLA/estagnação (dias parados) é que voltam a atuar naturalmente se a pendência persistir.
      const tarefaRef = db.collection("tarefas").doc(tarefaAtiva.id);
      update(tarefaRef, {
        status: "validated_done",
        atualizadoEm: agora,
        historicoEtapas: dados.historicoPasta ?? tarefaAtiva.data.historicoEtapas ?? [],
      });
      resumo.tarefasValidadas++;
      return;
    }

    if (tarefaAtiva?.data.status === "pendente" || tarefaAtiva?.data.status === "audit_failed") {
      const tarefaRef = db.collection("tarefas").doc(tarefaAtiva.id);
      if (!dados.condicaoAtiva && chaveExigeAcaoHumana(dados.chaveRegra)) {
        // Ação humana: o texto que disparou a regra sumiu da planilha, mas isso não prova que a
        // visita/treinamento aconteceu. A tarefa fica intocada — só fecha com o clique de quem a fez.
        return;
      }
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
          nomesRelacionados: dados.nomesRelacionados ?? null,
          ...(dados.clientesEnvolvidos ? { clientesEnvolvidos: dados.clientesEnvolvidos } : {}),
          clienteNome: dados.clienteNome ?? null,
          dataEntrada: dados.dataEntrada ?? null,
          historicoEtapas: dados.historicoPasta ?? tarefaAtiva.data.historicoEtapas ?? [],
          atualizadoEm: agora,
          // Escalonamento por falha de auditoria foi removido (ver reconciliarTarefa acima) —
          // uma tarefa "audit_failed" legada some do escalonamento assim que reconciliada de novo.
          escalonadoPara: [],
        });
      }
      return;
    }

    if (!tarefaAtiva && dados.condicaoAtiva) {
      const ref = db.collection("tarefas").doc();
      const tarefa: Omit<Tarefa, "id"> = {
        chaveRegra: dados.chaveRegra,
        origem: dados.origem,
        nivel: dados.nivel,
        importacaoIdCriacao: importacaoId,
        numero: dados.numero,
        numerosRelacionados: dados.numerosRelacionados ?? null,
        nomesRelacionados: dados.nomesRelacionados ?? null,
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
        escalonadoPara: [],
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

  // --- Passo 1: atualiza o estado de cada PASTA (registro/snapshot/histórico) e reconcilia as
  // tarefas dinâmicas por linha. A geração de tarefa é 100% do Motor de Regras (regras_auditoria);
  // sem nenhuma regra ativa cadastrada, esta importação não cria nenhuma tarefa nova.
  for (const linha of linhas) {
    const antigo = registrosAntigos.get(linha.numero) ?? null;
    const slaStatus = calcularSlaStatus(linha.prazoEtapa);
    if (!resolvePracaPorCidade(linha.cidade)) resumo.semPraca.push(linha.numero);

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

    const registroPayload = {
      numero: linha.numero,
      clienteNome: linha.clienteNome,
      dataEntrada: linha.dataEntrada,
      historicoEtapas: historicoPasta,
      cpfCnpj: linha.cpfCnpj,
      cidade: linha.cidade,
      produto: linha.produto,
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
        });
      }
      continue;
    }

    // Motor de Regras Dinâmicas — categorias por pasta: SLA/Estagnação, Análise Textual,
    // Regressão e Conformidade (vencimento longo).
    for (const dinamica of avaliarRegrasPorLinha(regrasDinamicasAtivas, linha, historicoPasta, antigo, importacaoId)) {
      reconciliarTarefa({
        ...camposComuns,
        chaveRegra: dinamica.chaveRegra,
        nivel: NIVEL_POR_QUADRO[dinamica.quadro],
        quadro: dinamica.quadro,
        tipoPendencia: dinamica.tipoPendencia,
        descricao: dinamica.descricao,
        condicaoAtiva: dinamica.condicaoAtiva,
      });
    }
  }

  // --- Passo 2: Motor de Regras Dinâmicas — categorias agregadas (Volume/Gargalos, Ociosidade,
  // Qualidade/Reprovação, Conformidade/duplicidade, Ações Positivas). Passa `linhas` sem filtrar
  // fim de esteira: Ações Positivas e Conformidade precisam enxergar pastas que acabaram de
  // chegar lá; Volume/Gargalos filtra isso sozinho, internamente. Fecha sozinha quando a
  // contagem cai, a não ser que a regra tenha `exigeAcaoHumana` (chaveExigeAcaoHumana).
  for (const dinamica of avaliarRegrasAgregadasDinamicas(regrasDinamicasAtivas, linhas, registrosAntigos, importacaoId)) {
    reconciliarTarefa({
      chaveRegra: dinamica.chaveRegra,
      origem: dinamica.origem,
      nivel: NIVEL_POR_QUADRO[dinamica.quadro],
      numero: null,
      numerosRelacionados: dinamica.numerosRelacionados ?? undefined,
      nomesRelacionados: dinamica.nomesRelacionados ?? undefined,
      cidade: "",
      quadro: dinamica.quadro,
      imobiliaria: dinamica.imobiliaria,
      etapa: dinamica.etapa,
      prazoEtapa: null,
      slaStatus: "no_prazo",
      tipoPendencia: dinamica.tipoPendencia,
      descricao: dinamica.descricao,
      observacaoOriginal: "",
      condicaoAtiva: dinamica.condicaoAtiva,
    });
  }

  // --- Passo 3: Motor de Regras Dinâmicas — "SLA Interno" (observa as próprias tarefas do
  // sistema, não a planilha). Fecha o alerta quando a tarefa-alvo deixa de estar entre as
  // atualmente estagnadas (foi resolvida, ou parou de bater com os critérios da regra).
  const chavesSlaInternoAtuais = new Set<string>();
  for (const dinamica of avaliarRegrasDeTarefas(regrasDinamicasAtivas, tarefasPorChave, importacaoId)) {
    chavesSlaInternoAtuais.add(dinamica.chaveRegra);
    reconciliarTarefa({
      chaveRegra: dinamica.chaveRegra,
      origem: dinamica.origem,
      nivel: NIVEL_POR_QUADRO[dinamica.quadro],
      numero: null,
      cidade: "",
      quadro: dinamica.quadro,
      imobiliaria: "",
      etapa: "",
      prazoEtapa: null,
      slaStatus: "no_prazo",
      tipoPendencia: dinamica.tipoPendencia,
      descricao: dinamica.descricao,
      observacaoOriginal: "",
      condicaoAtiva: dinamica.condicaoAtiva,
    });
  }
  for (const [chave, t] of tarefasPorChave) {
    if (!chave.includes("::sla_interno::") || chavesSlaInternoAtuais.has(chave)) continue;
    reconciliarTarefa({
      chaveRegra: chave,
      origem: "agregado",
      nivel: t.data.nivel,
      numero: null,
      cidade: "",
      quadro: t.data.praca,
      imobiliaria: "",
      etapa: "",
      prazoEtapa: null,
      slaStatus: "no_prazo",
      tipoPendencia: t.data.tipoPendencia,
      descricao: t.data.descricao,
      observacaoOriginal: "",
      condicaoAtiva: false,
    });
  }

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

