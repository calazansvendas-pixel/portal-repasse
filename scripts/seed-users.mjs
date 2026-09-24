// Cria (ou atualiza) os 6 usuários iniciais no Firebase Auth + o perfil de cada um
// na coleção "users" do Firestore, com a role e a praça corretas.
//
// Uso:
//   1. Preencha .env.local (veja .env.local.example) com as credenciais do Admin SDK.
//   2. Ajuste SENHA_TEMPORARIA/e-mails abaixo se precisar (cada pessoa deve trocar a senha no primeiro login).
//   3. Rode: npm run seed:users
//
// Este script é idempotente: pode ser rodado de novo sem duplicar usuários.

import { config } from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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
const auth = getAuth(app);
const db = getFirestore(app);

// Senha temporária padrão para os 6 perfis iniciais — cada pessoa deve
// trocá-la no primeiro acesso (fluxo de "esqueci minha senha" do Firebase).
const SENHA_TEMPORARIA = "Morar@2026";

const USUARIOS = [
  { nome: "Calazans", email: "calazans@morar.com.br", senha: SENHA_TEMPORARIA, role: "gerencia" },
  { nome: "Paulo", email: "paulo@morar.com.br", senha: SENHA_TEMPORARIA, role: "coordenador" },
  { nome: "Andressa", email: "andressa@morar.com.br", senha: SENHA_TEMPORARIA, role: "analista" },
  { nome: "Laiza", email: "laiza@morar.com.br", senha: SENHA_TEMPORARIA, role: "assistente", praca: "laiza" },
  { nome: "Eliane", email: "eliane@morar.com.br", senha: SENHA_TEMPORARIA, role: "assistente", praca: "eliane" },
  { nome: "Catarina", email: "catarina@morar.com.br", senha: SENHA_TEMPORARIA, role: "assistente", praca: "catarina" },
];

for (const u of USUARIOS) {
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(u.email);
    console.log(`✓ ${u.email} já existe (uid ${userRecord.uid})`);
  } catch (err) {
    if (err.code === "auth/configuration-not-found") {
      console.error(
        "\nO Firebase Authentication ainda não está ativado neste projeto.\n" +
          "No Console: Authentication > Get started > Sign-in method > ative 'E-mail/senha'.\n" +
          "Depois rode `npm run seed:users` de novo."
      );
      process.exit(1);
    }
    if (err.code !== "auth/user-not-found") throw err;

    userRecord = await auth.createUser({ email: u.email, password: u.senha, displayName: u.nome });
    console.log(`+ ${u.email} criado (uid ${userRecord.uid})`);
  }

  await db.collection("users").doc(userRecord.uid).set(
    {
      nome: u.nome,
      email: u.email,
      role: u.role,
      ...(u.praca ? { praca: u.praca } : {}),
      ativo: true,
      criadoEm: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log(`  perfil (${u.role}${u.praca ? `/${u.praca}` : ""}) gravado no Firestore.`);
}

console.log("\nConcluído. Peça para cada pessoa trocar a senha temporária no primeiro acesso.");
process.exit(0);
