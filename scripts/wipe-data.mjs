// Zera a base para testes: apaga TODOS os documentos de "tarefas",
// "importacoes", "registros" e a subcoleção "snapshots"
// (registros/{numero}/snapshots/{importacaoId}, varrida via collectionGroup).
// NÃO toca em "users" — a única coleção que sobrevive a este reset.
//
// Uso: npm run wipe:data

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

const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const db = getFirestore(app);

async function apagarTodosOsDocs(query, rotulo) {
  const snap = await query.get();
  if (snap.empty) {
    console.log(`- ${rotulo}: nada para apagar.`);
    return 0;
  }
  const lote = 450;
  let apagados = 0;
  for (let i = 0; i < snap.docs.length; i += lote) {
    const batch = db.batch();
    snap.docs.slice(i, i + lote).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    apagados += Math.min(lote, snap.docs.length - i);
  }
  console.log(`- ${rotulo}: ${apagados} documento(s) apagado(s).`);
  return apagados;
}

(async () => {
  console.log(`Zerando TODOS os dados do projeto "${projectId}" (exceto 'users')...`);
  // Snapshots primeiro (subcoleção de registros — apagar o pai não apaga os filhos sozinho).
  await apagarTodosOsDocs(db.collectionGroup("snapshots"), "snapshots (todas as pastas)");
  await apagarTodosOsDocs(db.collection("registros"), "registros");
  await apagarTodosOsDocs(db.collection("importacoes"), "importacoes");
  await apagarTodosOsDocs(db.collection("tarefas"), "tarefas");
  await apagarTodosOsDocs(db.collection("notificacoes"), "notificacoes");
  console.log("\nConcluído. Só a coleção 'users' foi preservada.");
  process.exit(0);
})();
