import type { Firestore } from "firebase-admin/firestore";
import { codigoEtapa } from "@/lib/auth/roles";
import { extrairMovimentos, type PastaDossie } from "@/lib/utils/movimentacoes";
import type { PastaResumo } from "@/lib/utils/buscaClientes";
import type { EtapaHistorico, Registro, Tarefa } from "@/lib/types";

// Mesmo teto de leitura do relatório de imobiliárias: uma única consulta; o filtro é feito na tela.
export const LIMITE_BUSCA = 3000;

export interface BaseDossie {
  pastas: PastaDossie[];
  /** Código da etapa -> descrição mais recente vista ("0.80" -> "0.80 - Pasta em tratamento"). */
  etapas: Record<string, string>;
  /** Datas da primeira e da última planilha presentes nos trajetos. */
  primeiraPlanilha: string | null;
  ultimaPlanilha: string | null;
}

/** Todas as pastas com as movimentações de etapa — alimenta o campo de cliente e os superfiltros. */
export async function lerBaseDossie(db: Firestore): Promise<BaseDossie> {
  const snap = await db
    .collection("registros")
    .select("clienteNome", "cpfCnpj", "produto", "etapa", "arquivada", "atualizadoEm", "historicoEtapas")
    .limit(LIMITE_BUSCA)
    .get();
  const docs = snap.docs.map((d) => ({
    ...(d.data() as Omit<PastaResumo, "numero"> & { historicoEtapas?: EtapaHistorico[] }),
    numero: d.id,
  }));

  const passos = docs.flatMap((d) => d.historicoEtapas ?? []).sort((a, b) => a.data.localeCompare(b.data));
  const etapas: Record<string, string> = {};
  for (const p of passos) {
    const codigo = codigoEtapa(p.etapa ?? "");
    if (codigo) etapas[codigo] = p.etapa.trim();
  }
  for (const d of docs) {
    const codigo = codigoEtapa(d.etapa ?? "");
    if (codigo) etapas[codigo] ??= d.etapa!.trim();
  }
  const primeiraPlanilha = passos[0]?.data ?? null;

  return {
    pastas: docs.map(({ historicoEtapas, ...pasta }) => ({
      ...pasta,
      movimentos: extrairMovimentos(historicoEtapas ?? [], primeiraPlanilha ?? ""),
    })),
    etapas,
    primeiraPlanilha,
    ultimaPlanilha: passos[passos.length - 1]?.data ?? null,
  };
}

export interface DossieCompleto {
  registro: Registro & { numero: string };
  tarefas: Tarefa[];
}

/** Pasta completa (registro + todas as tarefas — de linha e agregadas — que já a envolveram). */
export async function lerDossieCliente(db: Firestore, numero: string): Promise<DossieCompleto | null> {
  const regSnap = await db.collection("registros").doc(numero).get();
  if (!regSnap.exists) return null;
  const registro = { numero: regSnap.id, ...(regSnap.data() as Omit<Registro, "numero">) };

  const [porNumero, porRelacionadas] = await Promise.all([
    db.collection("tarefas").where("numero", "==", numero).get(),
    db.collection("tarefas").where("numerosRelacionados", "array-contains", numero).get(),
  ]);

  const porId = new Map<string, Tarefa>();
  for (const doc of [...porNumero.docs, ...porRelacionadas.docs]) {
    porId.set(doc.id, { id: doc.id, ...(doc.data() as Omit<Tarefa, "id">) });
  }
  const tarefas = [...porId.values()].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));

  return { registro, tarefas };
}
