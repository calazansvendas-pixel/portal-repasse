// Zera a base para testes: apaga TODOS os documentos das coleções "tarefas"
// e "snapshots" (subcoleção registros/{numero}/snapshots/{importacaoId},
// varrida via collectionGroup). NÃO toca em "users". "registros" (estado
// atual das pastas) e "importacoes" (histórico) também não são tocados —
// use a funcionalidade "Excluir Importação" na tela de Auditoria para
// remover uma importação específica de forma controlada.
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
  console.log(`Zerando dados do projeto "${projectId}" (tarefas + snapshots)...`);
  await apagarTodosOsDocs(db.collection("tarefas"), "tarefas");
  await apagarTodosOsDocs(db.collectionGroup("snapshots"), "snapshots (todas as pastas)");
  console.log("\nConcluído. Coleções 'users', 'registros' e 'importacoes' não foram alteradas.");
  process.exit(0);
})();
