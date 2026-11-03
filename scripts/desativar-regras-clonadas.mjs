// Lista (e opcionalmente desativa/exclui) as regras clonadas do Motor de Regras (coleção
// `regras_auditoria`): mesma etapa/gatilho/destino/texto de outra regra ativa, com prazo (`dias`)
// maior e/ou nome "(Cópia)". Mantém a ORIGINAL (menor `dias`) — critério em lib-regras-clonadas.mjs.
//
// Também mostra, só para conferência, regras da MESMA etapa e gatilho que NÃO são clones (diferem em
// texto, destino ou parâmetros) e o que muda entre elas — essas nunca são tocadas.
//
// Uso: npm run desativar:regras-clonadas                    (simulação, só lista)
//      npm run desativar:regras-clonadas -- --apply         (desativa: ativo = false)
//      npm run desativar:regras-clonadas -- --apply --excluir   (apaga o documento da regra)

import { config } from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { agruparRegras, diasDaRegra, normalize } from "./lib-regras-clonadas.mjs";

config({ path: ".env.local" });

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Faltam credenciais do Admin SDK em .env.local. Veja .env.local.example.");
  process.exit(1);
}

const aplicar = process.argv.includes("--apply");
const excluir = process.argv.includes("--excluir");
const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));

const snap = await db.collection("regras_auditoria").get();
const regras = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
const ativas = regras.filter((r) => r.ativo !== false);
console.log(`${regras.length} regra(s), ${ativas.length} ativa(s). Modo: ${aplicar ? (excluir ? "APLICAR (excluir)" : "APLICAR (desativar)") : "SIMULAÇÃO"}\n`);

const linha = (r) =>
  `${r.id} | "${r.nomeRegra}" | etapa ${r.parametros?.etapa ?? "-"} | dias ${r.parametros?.dias ?? "-"} | destino ${
    r.destinoTipo === "pessoa" ? `pessoa ${r.pessoaNome ?? r.pessoaId}` : r.cargoDestino
  }${r.filtroPraca ? ` | praça ${r.filtroPraca}` : ""}`;

let aDesativar = 0;
for (const lista of agruparRegras(regras).values()) {
  if (lista.length < 2) continue;
  const [original, ...clones] = lista;
  console.log(`Etapa ${original.parametros?.etapa ?? "-"} — ${lista.length} regras equivalentes`);
  console.log(`  = mantém  ${linha(original)}`);
  for (const c of clones) {
    console.log(`  - ${aplicar ? (excluir ? "exclui  " : "desativa") : "clone   "} ${linha(c)}${diasDaRegra(c) === diasDaRegra(original) ? "  (mesmo prazo!)" : ""}`);
    aDesativar++;
    if (!aplicar) continue;
    if (excluir) await c.ref.delete();
    else await c.ref.update({ ativo: false, atualizadoEm: new Date().toISOString() });
  }
}

// Conferência: mesma etapa + gatilho, mas não são clones — mostra o que as diferencia.
console.log("\nMesma etapa e gatilho, mas NÃO são clones (não tocadas):");
const porEtapa = new Map();
for (const r of ativas) {
  const k = `${r.categoriaGatilho}|${normalize(r.parametros?.etapa)}`;
  porEtapa.set(k, [...(porEtapa.get(k) ?? []), r]);
}
for (const lista of porEtapa.values()) {
  const distintas = new Map();
  for (const r of lista) {
    const k = JSON.stringify([r.destinoTipo ?? "cargo", r.cargoDestino, r.pessoaId ?? null, r.filtroPraca ?? null, normalize(r.textoTarefa), { ...r.parametros, dias: 0 }]);
    distintas.set(k, [...(distintas.get(k) ?? []), r]);
  }
  if (distintas.size < 2) continue;
  const [base, ...resto] = [...distintas.values()].map((l) => l[0]);
  console.log(`  etapa ${base.parametros?.etapa ?? "-"}:`);
  console.log(`    ${linha(base)}`);
  for (const r of resto) {
    const difs = [];
    if ((r.destinoTipo ?? "cargo") !== (base.destinoTipo ?? "cargo") || r.cargoDestino !== base.cargoDestino || (r.pessoaId ?? null) !== (base.pessoaId ?? null)) difs.push("destino");
    if ((r.filtroPraca ?? null) !== (base.filtroPraca ?? null)) difs.push("praça");
    if (normalize(r.textoTarefa) !== normalize(base.textoTarefa)) difs.push("texto");
    if (JSON.stringify({ ...r.parametros, dias: 0 }) !== JSON.stringify({ ...base.parametros, dias: 0 })) difs.push("parâmetros");
    console.log(`    ${linha(r)}   <- difere em: ${difs.join(", ") || "?"}`);
  }
}

console.log(`\n${aDesativar} regra(s) clonada(s) ${aplicar ? "tratada(s)" : "a desativar"}.`);
process.exit(0);
