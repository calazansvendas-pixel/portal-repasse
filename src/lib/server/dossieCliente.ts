import type { Firestore } from "firebase-admin/firestore";
import { normalize } from "@/lib/auth/roles";
import type { Registro, Tarefa } from "@/lib/types";

// Mesmo teto de leitura do relatório de imobiliárias: uma única consulta, sem índice dedicado
// para busca por nome/CPF (Firestore não faz "contains" nativo).
export const LIMITE_BUSCA = 3000;
const MAX_CANDIDATOS = 30;

export interface CandidatoDossie {
  numero: string;
  clienteNome: string | null;
  cpfCnpj: string;
  cidade: string;
  produto?: string;
  etapa: string;
}

function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Busca por Nome (contém, sem acento) ou CPF/CNPJ (contém os dígitos informados). */
export async function buscarCandidatosDossie(db: Firestore, termoBruto: string): Promise<CandidatoDossie[]> {
  const termo = termoBruto.trim();
  if (!termo) return [];

  const digitos = somenteDigitos(termo);
  // Só vale a pena comparar dígitos com um mínimo razoável — "1" bateria com quase tudo.
  const podeBaterPorCpf = digitos.length >= 4;
  const nomeAlvo = normalize(termo);

  const snap = await db
    .collection("registros")
    .select("numero", "clienteNome", "cpfCnpj", "cidade", "produto", "etapa")
    .limit(LIMITE_BUSCA)
    .get();

  const candidatos: CandidatoDossie[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as Omit<Registro, "numero">;
    const bateCpf = podeBaterPorCpf && somenteDigitos(d.cpfCnpj ?? "").includes(digitos);
    const bateNome = !!d.clienteNome && normalize(d.clienteNome).includes(nomeAlvo);
    if (!bateCpf && !bateNome) continue;

    candidatos.push({
      numero: doc.id,
      clienteNome: d.clienteNome ?? null,
      cpfCnpj: d.cpfCnpj ?? "",
      cidade: d.cidade ?? "",
      produto: d.produto,
      etapa: d.etapa ?? "",
    });
    if (candidatos.length >= MAX_CANDIDATOS) break;
  }
  return candidatos;
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
