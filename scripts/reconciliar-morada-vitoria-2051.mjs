// Reconcilia as tarefas ATIVAS do Morada Vitória na etapa 2.051 que ficaram com a Laiza/Layza
// (roteamento por cidade) e as passa para a Catharina — mesma regra fixa de
// resolveRegraFixaEtapa (src/lib/auth/roles.ts). Tarefas com override manual da Gerência
// (pracaCustomizada) são preservadas e apenas listadas.
//
// Uso: npm run reconciliar:morada-vitoria          (simulação, não grava nada)
//      npm run reconciliar:morada-vitoria -- --apply

import { config } from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

config({ path: ".env.local" });

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Faltam credenciais do Admin SDK em .env.local. Veja .env.local.example.");
  process.exit(1);
}

const aplicar = process.argv.includes("--apply");
const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));

const normalize = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const codigoEtapa = (e) => String(e ?? "").trim().split(" - ")[0]?.trim() || String(e ?? "").trim();
const semPreposicao = (v) =>
  normalize(v)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !["de", "da", "do", "das", "dos"].includes(p))
    .join(" ");
// Mesmo critério de resolveRegraFixaEtapa: código 2.051 (texto ou número) ou menção isolada "2.051"
// na etapa/título; "Morada Vitória" no produto, na etapa ou no título. Histórico de etapas fica de fora.
const ehMoradaVitoria2051 = (produto, etapa, titulos) => {
  const textos = [etapa, ...titulos].map((t) => String(t ?? ""));
  if (![produto, ...textos].some((t) => semPreposicao(t).includes("morada vitoria"))) return false;
  const cod = codigoEtapa(textos[0]);
  return cod === "2.051" || Number(cod) === 2.051 || textos.some((t) => /(^|[^0-9.])2\.051(?![0-9])/.test(t));
};

// Colaboradora da Catharina (para responsavelId/Nome), se houver um único usuário ativo no quadro.
const usersSnap = await db.collection("users").where("praca", "==", "catharina").get();
const catharinas = usersSnap.docs.filter((d) => d.data().ativo !== false);
const catharina = catharinas.length === 1 ? { id: catharinas[0].id, nome: catharinas[0].data().nome } : null;

const snap = await db.collection("tarefas").where("status", "in", ["pendente", "pending_validation", "audit_failed"]).get();
console.log(`${snap.size} tarefa(s) ativa(s) lida(s). Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO"}\n`);

let alteradas = 0;
for (const doc of snap.docs) {
  const t = doc.data();
  if (!t.numero) continue;
  const registro = await db.collection("registros").doc(t.numero).get();
  if (!ehMoradaVitoria2051(registro.data()?.produto, t.etapa, [t.tipoPendencia, registro.data()?.etapa])) continue;

  const rotulo = `${doc.id} (pasta ${t.numero}, ${t.tipoPendencia}) praca=${t.praca}`;
  if (t.pracaCustomizada) {
    console.log(`~ ${rotulo}: override manual (${t.pracaCustomizada}) — preservado`);
    continue;
  }
  if (t.praca === "catharina" && (t.responsavelNome ?? "Catharina").toLowerCase().includes("catharina")) {
    console.log(`= ${rotulo}: já está com a Catharina`);
    continue;
  }
  console.log(`+ ${rotulo} -> catharina`);
  if (aplicar) {
    await doc.ref.update({
      praca: "catharina",
      responsavelId: catharina?.id ?? null,
      responsavelNome: catharina?.nome ?? null,
      atualizadoEm: new Date().toISOString(),
    });
  }
  alteradas++;
}

console.log(`\n${aplicar ? "Corrigida(s)" : "A corrigir"}: ${alteradas} tarefa(s).`);
process.exit(0);
