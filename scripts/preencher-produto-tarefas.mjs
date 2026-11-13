// Preenche `produto` (empreendimento) nas tarefas de pasta criadas antes do campo existir, copiando
// do registro da pasta (coleção "registros", coluna "Empreendimento" da planilha). Sem isso o
// filtro por Empreendimento do painel só enxerga uma tarefa depois da próxima importação.
// Tarefas avulsas e agregadas (sem pasta) são ignoradas.
//
// Uso: npm run preencher:produto          (simulação, não grava nada)
//      npm run preencher:produto -- --apply

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

const snap = await db.collection("tarefas").get();
const alvo = snap.docs.filter((d) => {
  const t = d.data();
  return t.origem === "linha" && t.numero && !String(t.produto ?? "").trim();
});
console.log(`${snap.size} tarefa(s) no total, ${alvo.length} de pasta sem produto. Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO"}\n`);

// Lê cada registro uma vez só (várias tarefas podem ser da mesma pasta).
const numeros = [...new Set(alvo.map((d) => d.data().numero))];
const produtoPorNumero = new Map();
for (let i = 0; i < numeros.length; i += 300) {
  const refs = numeros.slice(i, i + 300).map((n) => db.collection("registros").doc(n));
  const registros = await db.getAll(...refs);
  for (const r of registros) produtoPorNumero.set(r.id, r.exists ? String(r.data().produto ?? "").trim() : "");
}

let preenchidas = 0;
let semProduto = 0;
let batch = db.batch();
let ops = 0;
for (const d of alvo) {
  const produto = produtoPorNumero.get(d.data().numero);
  if (!produto) {
    semProduto++;
    continue;
  }
  preenchidas++;
  if (!aplicar) continue;
  batch.update(d.ref, { produto });
  if (++ops >= 450) {
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }
}
if (aplicar && ops) await batch.commit();

console.log(`${aplicar ? "Preenchida(s)" : "A preencher"}: ${preenchidas}. Sem empreendimento no registro: ${semProduto}.`);
process.exit(0);
