import type { Firestore } from "firebase-admin/firestore";
import type { LinhaPlanilha } from "./parseSheet";
import { calcularEscalonamento, detectarPendencia, montarDescricaoTarefa } from "./taskRouter";
import { resolvePracaPorCidade } from "@/lib/auth/roles";
import { calcularSlaStatus } from "@/lib/utils/sla";
import type { Registro, Tarefa } from "@/lib/types";

export interface ResumoImportacao {
  importacaoId: string;
  sheetName: string;
  totalLinhas: number;
  novos: number;
  atualizados: number;
  tarefasCriadas: number;
  tarefasValidadas: number;
  falhasAuditoria: number;
  semPraca: string[]; // números de pasta cuja cidade não bateu com nenhuma praça
}

// "audit_failed" entra como ativa para que a próxima importação continue
// atualizando/rastreando a mesma tarefa em vez de criar um card duplicado.
const ATIVAS: Tarefa["status"][] = ["pendente", "pending_validation", "audit_failed"];
const FIRESTORE_BATCH_LIMIT = 450; // margem de segurança abaixo do limite de 500 do Firestore

/**
 * Motor de auditoria diária ("Daily Delta"): compara a planilha recém-importada
 * com o estado atual de cada pasta (coleção "registros", doc id = Número) e:
 *  - cria registros/tarefas para pastas novas;
 *  - valida tarefas que a assistente marcou como resolvidas, se a etapa avançou;
 *  - devolve ao quadro (com tag de falha) tarefas "fake done" que não avançaram;
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

  const tarefasAtivasSnap = await db.collection("tarefas").where("status", "in", ATIVAS).get();
  const tarefasPorNumero = new Map<string, { id: string; data: Tarefa }>();
  tarefasAtivasSnap.forEach((doc) => {
    const data = doc.data() as Tarefa;
    // Assume no máximo uma tarefa ativa por pasta (modelo de 1 card por pendência corrente).
    tarefasPorNumero.set(data.numero, { id: doc.id, data });
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

  for (const linha of linhas) {
    const antigo = registrosAntigos.get(linha.numero) ?? null;
    const pendenciaAtual = detectarPendencia(linha.observacao);
    const slaStatus = calcularSlaStatus(linha.prazoEtapa);
    const praca = resolvePracaPorCidade(linha.cidade);
    if (!praca) resumo.semPraca.push(linha.numero);

    const registroRef = db.collection("registros").doc(linha.numero);
    const snapshotRef = registroRef.collection("snapshots").doc(importacaoId);
    set(snapshotRef, { ...linha, importacaoId, importadoEm: agora }, false);

    const registroPayload: Partial<Registro> & Record<string, unknown> = {
      numero: linha.numero,
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
    };

    const tarefaAtiva = tarefasPorNumero.get(linha.numero);

    if (!antigo) {
      // --- Nova entrada: pasta não existia no banco no dia anterior. ---
      resumo.novos++;
      set(registroRef, { ...registroPayload, criadoEm: agora });

      if (pendenciaAtual && praca) {
        const novaTarefaRef = db.collection("tarefas").doc();
        set(novaTarefaRef, montarNovaTarefa({ linha, praca, pendenciaAtual, slaStatus, agora }), false);
        resumo.tarefasCriadas++;
      }
      continue;
    }

    // --- Pasta já conhecida. ---
    resumo.atualizados++;
    set(registroRef, registroPayload);

    const etapaAvancou = antigo.etapa !== linha.etapa;
    const mesmaPendenciaDeAntes = tarefaAtiva ? pendenciaAtual?.tipoPendencia === tarefaAtiva.data.tipoPendencia : false;

    if (tarefaAtiva?.data.status === "pending_validation") {
      const tarefaRef = db.collection("tarefas").doc(tarefaAtiva.id);
      const sucesso = etapaAvancou && !mesmaPendenciaDeAntes;

      if (sucesso) {
        update(tarefaRef, { status: "validated_done", atualizadoEm: agora });
        resumo.tarefasValidadas++;
      } else {
        // "Fake done": a assistente marcou como resolvida, mas a pasta não avançou.
        update(tarefaRef, {
          status: "audit_failed",
          atualizadoEm: agora,
          falhaAuditoriaMotivo: etapaAvancou
            ? "Etapa avançou, mas a mesma pendência foi identificada novamente."
            : "A pasta permanece na mesma etapa da última importação.",
          falhaAuditoriaEm: agora,
          escalonadoPara: calcularEscalonamento({ slaStatus, falhouAuditoriaAgora: true }),
        });
        const notifRef = db.collection("notificacoes").doc();
        set(
          notifRef,
          {
            tipo: "falha_auditoria",
            tarefaId: tarefaAtiva.id,
            numero: linha.numero,
            mensagem: `Falha de auditoria na pasta ${linha.numero}: tarefa marcada como resolvida, mas a pendência persiste.`,
            destinatariosRoles: ["gerencia", "coordenador", "analista"],
            criadoEm: agora,
            lida: false,
          },
          false
        );
        resumo.falhasAuditoria++;
      }
      continue;
    }

    if (tarefaAtiva?.data.status === "pendente" || tarefaAtiva?.data.status === "audit_failed") {
      const tarefaRef = db.collection("tarefas").doc(tarefaAtiva.id);
      if (!pendenciaAtual) {
        // Pendência sumiu da observação sem passar por validação manual: fecha silenciosamente.
        update(tarefaRef, { status: "validated_done", atualizadoEm: agora });
        resumo.tarefasValidadas++;
      } else {
        update(tarefaRef, {
          etapa: linha.etapa,
          prazoEtapa: linha.prazoEtapa,
          slaStatus,
          tipoPendencia: pendenciaAtual.tipoPendencia,
          observacaoOriginal: linha.observacao,
          descricao: montarDescricaoTarefa({
            responsavel: linha.responsavel,
            acao: pendenciaAtual.acao,
            numero: linha.numero,
            slaStatus,
          }),
          atualizadoEm: agora,
          // Mantém o alerta da Analista enquanto a falha de auditoria não for
          // resolvida de novo; SLA crítico é recalculado a cada importação.
          escalonadoPara: calcularEscalonamento({
            slaStatus,
            falhouAuditoriaAgora: tarefaAtiva.data.status === "audit_failed",
          }),
        });
      }
      continue;
    }

    if (!tarefaAtiva && pendenciaAtual && praca) {
      const novaTarefaRef = db.collection("tarefas").doc();
      set(novaTarefaRef, montarNovaTarefa({ linha, praca, pendenciaAtual, slaStatus, agora }), false);
      resumo.tarefasCriadas++;
    }
  }

  batches.push(batch);

  const importacaoRef = db.collection("importacoes").doc(importacaoId);
  const ultimoBatch = batches[batches.length - 1];
  ultimoBatch.set(importacaoRef, {
    id: importacaoId,
    nomeArquivo,
    importadoPor,
    importadoEm: agora,
    totalRegistros: resumo.totalLinhas,
    novos: resumo.novos,
    atualizados: resumo.atualizados,
    tarefasCriadas: resumo.tarefasCriadas,
    tarefasValidadas: resumo.tarefasValidadas,
    falhasAuditoria: resumo.falhasAuditoria,
  });

  for (const b of batches) {
    await b.commit();
  }

  return resumo;
}

function montarNovaTarefa(params: {
  linha: LinhaPlanilha;
  praca: NonNullable<ReturnType<typeof resolvePracaPorCidade>>;
  pendenciaAtual: NonNullable<ReturnType<typeof detectarPendencia>>;
  slaStatus: Tarefa["slaStatus"];
  agora: string;
}) {
  const { linha, praca, pendenciaAtual, slaStatus, agora } = params;
  const tarefa: Omit<Tarefa, "id"> = {
    numero: linha.numero,
    cidade: linha.cidade,
    praca,
    imobiliaria: linha.responsavel,
    etapa: linha.etapa,
    prazoEtapa: linha.prazoEtapa,
    slaStatus,
    tipoPendencia: pendenciaAtual.tipoPendencia,
    descricao: montarDescricaoTarefa({
      responsavel: linha.responsavel,
      acao: pendenciaAtual.acao,
      numero: linha.numero,
      slaStatus,
    }),
    observacaoOriginal: linha.observacao,
    status: "pendente",
    criadoEm: agora,
    atualizadoEm: agora,
    resolvidoPor: null,
    resolvidoEm: null,
    etapaNoMomentoResolucao: null,
    observacaoNoMomentoResolucao: null,
    falhaAuditoriaMotivo: null,
    falhaAuditoriaEm: null,
    escalonadoPara: calcularEscalonamento({ slaStatus, falhouAuditoriaAgora: false }),
  };
  return tarefa;
}
