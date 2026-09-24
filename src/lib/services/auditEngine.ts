import type { Firestore } from "firebase-admin/firestore";
import type { LinhaPlanilha } from "./parseSheet";
import {
  calcularEscalonamento,
  detectarFiltroRuim,
  detectarGargalos,
  gerarEspecErroProcesso,
  gerarEspecOperacional,
  gerarEspecRiscoBancario,
} from "./taskRouter";
import { resolvePracaPorCidade } from "@/lib/auth/roles";
import { calcularSlaStatus } from "@/lib/utils/sla";
import type { NivelTarefa, OrigemTarefa, Quadro, Registro, SlaStatus, Tarefa } from "@/lib/types";

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

interface DadosParaReconciliar {
  chaveRegra: string;
  origem: OrigemTarefa;
  nivel: NivelTarefa;
  numero: string | null;
  numerosRelacionados?: string[];
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

  const tarefasAtivasSnap = await db.collection("tarefas").where("status", "in", ATIVAS).get();
  const tarefasPorChave = new Map<string, { id: string; data: Tarefa }>();
  tarefasAtivasSnap.forEach((doc) => {
    const data = doc.data() as Tarefa;
    tarefasPorChave.set(data.chaveRegra, { id: doc.id, data });
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

  function reconciliarTarefa(dados: DadosParaReconciliar) {
    const tarefaAtiva = tarefasPorChave.get(dados.chaveRegra);

    if (tarefaAtiva?.data.status === "pending_validation") {
      const tarefaRef = db.collection("tarefas").doc(tarefaAtiva.id);
      const sucesso = dados.avancoDetectado && !dados.condicaoAtiva;

      if (sucesso) {
        update(tarefaRef, { status: "validated_done", atualizadoEm: agora });
        resumo.tarefasValidadas++;
      } else {
        // "Fake done": marcada como resolvida, mas o gatilho continua valendo.
        update(tarefaRef, {
          status: "audit_failed",
          atualizadoEm: agora,
          falhaAuditoriaMotivo: dados.avancoDetectado
            ? "Avançou, mas a mesma pendência foi identificada novamente."
            : "Continua na mesma situação da última importação.",
          falhaAuditoriaEm: agora,
          escalonadoPara: calcularEscalonamento({
            quadro: dados.quadro,
            slaStatus: dados.slaStatus,
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
          descricao: dados.descricao,
          observacaoOriginal: dados.observacaoOriginal,
          numerosRelacionados: dados.numerosRelacionados ?? null,
          atualizadoEm: agora,
          escalonadoPara: calcularEscalonamento({
            quadro: dados.quadro,
            slaStatus: dados.slaStatus,
            falhouAuditoriaAgora: tarefaAtiva.data.status === "audit_failed",
          }),
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
        numero: dados.numero,
        numerosRelacionados: dados.numerosRelacionados,
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
          slaStatus: dados.slaStatus,
          falhouAuditoriaAgora: false,
        }),
      };
      set(ref, tarefa, false);
      resumo.tarefasCriadas++;
    }
  }

  // --- Passo 1: reconcilia as regras de LINHA (uma por pasta importada) ---
  for (const linha of linhas) {
    const antigo = registrosAntigos.get(linha.numero) ?? null;
    const slaStatus = calcularSlaStatus(linha.prazoEtapa);
    const praca = resolvePracaPorCidade(linha.cidade);
    if (!praca) resumo.semPraca.push(linha.numero);
    const etapaAvancou = antigo ? antigo.etapa !== linha.etapa : false;

    const registroRef = db.collection("registros").doc(linha.numero);
    const snapshotRef = registroRef.collection("snapshots").doc(importacaoId);
    set(snapshotRef, { ...linha, importacaoId, importadoEm: agora }, false);

    const registroPayload = {
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
      cidade: linha.cidade,
      imobiliaria: linha.responsavel,
      etapa: linha.etapa,
      prazoEtapa: linha.prazoEtapa,
      slaStatus,
      observacaoOriginal: linha.observacao,
      avancoDetectado: etapaAvancou,
    };

    // Nível Operacional (Laiza/Eliane/Catarina) — só existe se a cidade mapear para uma praça.
    if (praca) {
      const spec = gerarEspecOperacional(linha, praca, slaStatus);
      reconciliarTarefa({
        ...camposComuns,
        chaveRegra: spec?.chaveRegra ?? `${linha.numero}::operacional`,
        nivel: "operacional",
        quadro: praca,
        tipoPendencia: spec?.tipoPendencia ?? "",
        descricao: spec?.descricao ?? "",
        condicaoAtiva: spec !== null,
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
  reconciliarAgregados({
    especsAtuais: detectarGargalos(linhas),
    prefixoChave: "AGREGADO::gargalo::",
    tarefasPorChave,
    reconciliarTarefa,
  });
  reconciliarAgregados({
    especsAtuais: detectarFiltroRuim(linhas),
    prefixoChave: "AGREGADO::filtro_ruim::",
    tarefasPorChave,
    reconciliarTarefa,
  });

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
}) {
  const { especsAtuais, prefixoChave, tarefasPorChave, reconciliarTarefa } = params;
  const chavesAtuais = new Set(especsAtuais.map((e) => e.chaveRegra));

  for (const spec of especsAtuais) {
    reconciliarTarefa({
      chaveRegra: spec.chaveRegra,
      origem: "agregado",
      nivel: spec.nivel,
      numero: null,
      numerosRelacionados: spec.numerosRelacionados,
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
