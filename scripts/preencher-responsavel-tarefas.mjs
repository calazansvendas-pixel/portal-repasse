// Preenche responsavelId/responsavelNome nas tarefas ATIVAS onde estão null, a partir do quadro
// (praca) — só quando existe exatamente UM colaborador ativo naquele quadro (assistente da praça,
// ou único Coordenador/Analista). Tarefas com responsável já definido ou com override manual
// (responsavelCustomizadoId) são preservadas. Quadros ambíguos são apenas listados.
//
// Uso: npm run preencher:responsavel          (simulação, não grava nada)
//      npm run preencher:responsavel -- --apply

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

// Mesmo critério de quadroDoColaborador (produtividadeColaboradores.ts); Gerência fica de fora.
const quadroDe = (u) =>
  u.role === "assistente" ? u.praca ?? null : u.role === "coordenador" ? "coordenador" : u.role === "analista" ? "analista" : null;

const usersSnap = await db.collection("users").get();
const porQuadro = new Map();
for (const d of usersSnap.docs) {
  const u = d.data();
  if (u.ativo === false) continue;
  const quadro = quadroDe(u);
  if (!quadro) continue;
  porQuadro.set(quadro, [...(porQuadro.get(quadro) ?? []), { id: d.id, nome: u.nome ?? d.id }]);
}
console.log("Colaboradores por quadro:");
for (const [q, lista] of porQuadro) console.log(`  ${q}: ${lista.map((c) => `${c.nome} (${c.id})`).join(", ")}`);

const snap = await db.collection("tarefas").where("status", "in", ["pendente", "pending_validation", "audit_failed"]).get();
console.log(`\n${snap.size} tarefa(s) ativa(s) lida(s). Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO"}\n`);

let alteradas = 0;
let ambiguas = 0;
let semColaborador = 0;
for (const doc of snap.docs) {
  const t = doc.data();
  if (t.responsavelId || t.responsavelCustomizadoId) continue;
  const candidatos = porQuadro.get(t.praca) ?? [];
  if (candidatos.length === 0) {
    semColaborador++;
    continue;
  }
  if (candidatos.length > 1) {
    ambiguas++;
    continue;
  }
  const [alvo] = candidatos;
  console.log(`+ ${doc.id} (praca=${t.praca}) -> ${alvo.nome}`);
  if (aplicar) {
    await doc.ref.update({ responsavelId: alvo.id, responsavelNome: alvo.nome, atualizadoEm: new Date().toISOString() });
  }
  alteradas++;
}

console.log(
  `\n${aplicar ? "Atualizada(s)" : "A atualizar"}: ${alteradas}. Quadro ambíguo (>1 colaborador): ${ambiguas}. Quadro sem colaborador: ${semColaborador}.`
);
process.exit(0);
