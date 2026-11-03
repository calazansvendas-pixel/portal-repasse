// Reativa regras do Motor de Regras (regras_auditoria) pelo id — desfaz desativar-regras-clonadas.
//
// Uso: npm run reativar:regras -- id1 id2 ...            (simulação, só mostra)
//      npm run reativar:regras -- id1 id2 ... --apply    (ativo = true)

import { config } from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

config({ path: ".env.local" });

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Faltam credenciais do Admin SDK em .env.local. Veja .env.local.example.");
  process.exit(1);
}

const aplicar = process.argv.includes("--apply");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!ids.length) {
  console.error("Informe os ids das regras. Ex.: npm run reativar:regras -- abc123 def456 --apply");
  process.exit(1);
}
const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));

console.log(`Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO"}\n`);
let alteradas = 0;
for (const id of ids) {
  const ref = db.collection("regras_auditoria").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`? ${id}: não encontrada`);
    continue;
  }
  const r = snap.data();
  const rotulo = `${id} | "${r.nomeRegra}" | etapa ${r.parametros?.etapa ?? "-"} | dias ${r.parametros?.dias ?? "-"}`;
  if (r.ativo !== false) {
    console.log(`= ${rotulo}: já está ativa`);
    continue;
  }
  console.log(`+ ${rotulo} -> ativo: true`);
  if (aplicar) await ref.update({ ativo: true, atualizadoEm: new Date().toISOString() });
  alteradas++;
}
console.log(`\n${aplicar ? "Reativada(s)" : "A reativar"}: ${alteradas} regra(s).`);
process.exit(0);
