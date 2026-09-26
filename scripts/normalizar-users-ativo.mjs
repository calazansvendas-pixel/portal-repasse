// Varre a coleção "users" e declara `ativo: true` nos perfis que não têm o campo.
// Necessário antes de publicar as regras do Firestore que exigem `ativo == true`: sem o campo,
// o usuário perderia o acesso. Só toca em quem NÃO tem `ativo` (nunca altera ativo: false).
//
// Uso: npm run normalizar:users

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

const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));

const snap = await db.collection("users").get();
console.log(`${snap.size} usuário(s) encontrado(s).\n`);

let corrigidos = 0;
for (const doc of snap.docs) {
  const d = doc.data();
  const rotulo = `${d.nome ?? doc.id} (${d.role ?? "sem role"})`;
  if (d.ativo === undefined) {
    await doc.ref.update({ ativo: true });
    corrigidos++;
    console.log(`+ ${rotulo}: campo "ativo" ausente -> ativo: true`);
  } else {
    console.log(`= ${rotulo}: ativo = ${JSON.stringify(d.ativo)} (mantido)`);
  }
}

console.log(`\nConcluído: ${corrigidos} perfil(is) corrigido(s), ${snap.size - corrigidos} já estavam declarados.`);
process.exit(0);
