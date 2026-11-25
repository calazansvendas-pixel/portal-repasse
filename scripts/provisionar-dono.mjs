// Cria o cadastro do Dono do aplicativo (login + users/{uid}), sem tocar em nenhum outro usuário.
// A conta nasce com uma senha aleatória que ninguém conhece: o dono da caixa de entrada define a
// própria senha em "Esqueci minha senha" na tela de login. Idempotente.
//
// Uso: npm run provisionar:dono             (só mostra o que faria)
//      npm run provisionar:dono -- --apply

import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

config({ path: ".env.local" });

// Mantenha em sincronia com EMAIL_DONO / NOME_DONO em src/lib/auth/cargos.ts.
const EMAIL = "calazansvendas@gmail.com";
const NOME = "Rafael Calazans";
const aplicar = process.argv.includes("--apply");

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

let conta = await auth.getUserByEmail(EMAIL).catch((err) => {
  if (err.code === "auth/user-not-found") return null;
  throw err;
});

// Conta que já existe sem e-mail confirmado pode ter sido criada por outra pessoa: não promover.
if (conta && !conta.emailVerified && !(await db.collection("users").doc(conta.uid).get()).data()?.cargo) {
  console.error(
    'A conta já existe e o e-mail não foi confirmado. Use "Esqueci minha senha" e entre no portal: o acesso de Dono é ativado no login.'
  );
  process.exit(1);
}

console.log(conta ? "Login já existe." : "Login será criado.");
const ref = conta ? db.collection("users").doc(conta.uid) : null;
const atual = ref ? (await ref.get()).data() : undefined;
console.log(atual ? `Perfil atual: cargo ${atual.cargo ?? "-"}, ativo ${atual.ativo}` : "Perfil de Dono será criado.");

if (!aplicar) {
  console.log("\nSimulação: nada foi gravado. Rode com --apply para aplicar.");
  process.exit(0);
}

conta ??= await auth.createUser({ email: EMAIL, displayName: NOME, password: randomBytes(32).toString("base64url") });

const agora = new Date().toISOString();
const permissoes = [
  "gerenciarUsuarios",
  "importarPlanilhas",
  "editarMotorRegras",
  "editarParametros",
  "transferirTarefas",
  "exportarRelatorios",
];
await db
  .collection("users")
  .doc(conta.uid)
  .set(
    {
      email: EMAIL,
      nome: atual?.nome || NOME,
      cargo: "dono",
      role: "gerencia",
      status: "ativo",
      ativo: true,
      permissoesEfetivas: Object.fromEntries(permissoes.map((p) => [p, true])),
      criadoEm: atual?.criadoEm ?? agora,
      atualizadoEm: agora,
    },
    { merge: true }
  );

console.log('\nDono ativo. Para definir a senha, use "Esqueci minha senha" na tela de login.');
process.exit(0);
