// Unifica a conta antiga "Calazans" na conta do Dono, sem apagar nada:
//   1. quem tinha a conta antiga como Superior passa a responder ao Dono;
//   2. regras com destino fixo na conta antiga passam a apontar para o Dono (só id e nome);
//   3. liga a permissão individual "Importar Planilhas" do coordenador Paulo;
//   4. pausa a conta antiga — SOMENTE depois que o Dono já tiver entrado no portal, para ninguém
//      ficar sem acesso de gerência.
// Tarefas e histórico não são alterados. Idempotente.
//
// Uso: npm run unificar:dono             (só mostra o que faria)
//      npm run unificar:dono -- --apply

import { config } from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

config({ path: ".env.local" });

const EMAIL_DONO = "calazansvendas@gmail.com";
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

const contaDono = await auth.getUserByEmail(EMAIL_DONO);
const usuarios = await db.collection("users").get();
const dono = usuarios.docs.find((d) => d.id === contaDono.uid)?.data();

/** Exatamente um perfil com esse nome e função — ambíguo ou ausente aborta sem gravar nada. */
function unico(nome, role) {
  const achados = usuarios.docs.filter((d) => d.data().nome === nome && d.data().role === role);
  if (achados.length !== 1) {
    console.error(`Esperava exatamente um perfil "${nome}" (${role}), achei ${achados.length}. Nada foi alterado.`);
    process.exit(1);
  }
  return achados[0];
}
const docAntigo = unico("Calazans", "gerencia");
const antigo = docAntigo.data();
const uidAntigo = docAntigo.id;
const paulo = unico("Paulo", "coordenador");
if (dono?.cargo !== "dono" || dono.ativo !== true) {
  console.error("Perfil do Dono ativo não encontrado. Nada foi alterado.");
  process.exit(1);
}

const agora = new Date().toISOString();
const lote = db.batch();
let mudancas = 0;
const planejar = (ref, campos, descricao) => {
  console.log("•", descricao);
  lote.update(ref, campos);
  mudancas++;
};

for (const d of usuarios.docs.filter((d) => d.data().superiorId === uidAntigo)) {
  planejar(
    d.ref,
    { superiorId: contaDono.uid, superiorEmail: EMAIL_DONO, superiorNome: dono.nome, superiorCargo: "Dono", atualizadoEm: agora },
    `${d.data().nome}: superior passa a ser ${dono.nome}`
  );
}

const regras = await db.collection("regras_auditoria").where("pessoaId", "==", uidAntigo).get();
for (const r of regras.docs) {
  planejar(
    r.ref,
    { pessoaId: contaDono.uid, pessoaNome: dono.nome, atualizadoEm: agora },
    `Regra "${r.data().nomeRegra}" (${r.data().ativo ? "ativa" : "inativa"}): destino passa a ser ${dono.nome}`
  );
}

const matriz = (await db.doc("configuracoes/mapeamentoEmpreendimentos").get()).data()?.overrides ?? {};
if (Object.values(matriz).flat().some((a) => a?.colaboradorId === uidAntigo)) {
  console.log("! O Mapeamento de Empreendimentos cita a conta antiga: ajuste pela tela do Motor de Regras.");
}

if (paulo.data().permissoesEfetivas?.importarPlanilhas !== true) {
  planejar(
    paulo.ref,
    { "permissoesIndividuais.importarPlanilhas": true, "permissoesEfetivas.importarPlanilhas": true, atualizadoEm: agora },
    `${paulo.data().nome}: permissão "Importar Planilhas" ligada`
  );
}

const donoJaEntrou = !!contaDono.metadata.lastSignInTime;
if (antigo.ativo === true) {
  if (donoJaEntrou) {
    planejar(
      docAntigo.ref,
      { status: "pausado", ativo: false, atualizadoEm: agora },
      `Conta antiga "${antigo.nome}": pausada`
    );
  } else {
    console.log(
      `! Conta antiga NÃO será pausada: o Dono ainda não entrou no portal. Use "Esqueci minha senha", entre com ${EMAIL_DONO} e rode de novo.`
    );
  }
}

if (!mudancas) console.log("\nNada a alterar.");
else if (!aplicar) console.log(`\nSimulação: ${mudancas} mudança(s) prevista(s), nada gravado. Rode com --apply para aplicar.`);
else {
  await lote.commit();
  console.log(`\n${mudancas} mudança(s) aplicada(s).`);
}
process.exit(0);
