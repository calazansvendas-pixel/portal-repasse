// Lista (e opcionalmente arquiva/remove) tarefas ATIVAS duplicadas: mesmo CPF/contrato e mesma
// etapa, vindas de regras clonadas (mesma etapa/gatilho/destino/texto; só o nome "(Cópia)" e o prazo
// em `dias` mudam — ver lib-regras-clonadas.mjs). Mantém só o card da regra ORIGINAL (menor `dias`);
// os cards das regras clonadas são os excedentes. Se a original não tem card ativo no grupo, mantém
// o mais recentemente atualizado (nunca apaga a única tarefa que sobraria).
//
// Tarefas da mesma pasta e etapa de regras realmente diferentes (texto/destino distintos) NÃO são
// duplicatas: só aparecem num aviso final.
//
// Uso: npm run limpar:duplicadas                   (simulação, não grava nada)
//      npm run limpar:duplicadas -- --apply        (arquiva as cópias: status validated_done)
//      npm run limpar:duplicadas -- --apply --excluir   (apaga as cópias de vez)

import { config } from "dotenv";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { agruparRegras, assinaturaSemDias, normalize } from "./lib-regras-clonadas.mjs";

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

const codigoEtapa = (e) => String(e ?? "").trim().split(" - ")[0]?.trim() || String(e ?? "").trim();
const apenasDigitos = (v) => String(v ?? "").replace(/\D/g, "");
// Pasta = CPF/CNPJ quando existe (pega o mesmo cliente em contratos/pastas diferentes), senão o número.
const pasta = (t) => apenasDigitos(t.cpfCnpj) || `n:${t.numero}`;
const idRegra = (t) => /^DINAMICA::([^:]+)::/.exec(t.chaveRegra ?? "")?.[1] ?? "-";

const regrasSnap = await db.collection("regras_auditoria").get();
const regras = new Map(regrasSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
const grupoDeRegras = agruparRegras([...regras.values()], { incluirInativas: true });
const originalPorAssinatura = new Map([...grupoDeRegras].map(([a, lista]) => [a, lista[0].id]));
const assinaturaDaTarefa = (t) => {
  const r = regras.get(idRegra(t));
  return r ? assinaturaSemDias(r) : `chave:${t.chaveRegra}`;
};
const ehDaRegraOriginal = (t) => {
  const r = regras.get(idRegra(t));
  return !!r && originalPorAssinatura.get(assinaturaSemDias(r)) === r.id;
};

const snap = await db.collection("tarefas").where("status", "in", ["pendente", "pending_validation", "audit_failed"]).get();
const tarefas = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() })).filter((t) => t.origem === "linha" && t.numero);
console.log(
  `${tarefas.length} tarefa(s) ativa(s) de pasta, ${regras.size} regra(s). Modo: ${aplicar ? (excluir ? "APLICAR (excluir)" : "APLICAR (arquivar)") : "SIMULAÇÃO"}\n`
);

const porEtapa = new Map();
for (const t of tarefas) {
  const chave = `${pasta(t)}|${codigoEtapa(t.etapa)}`;
  porEtapa.set(chave, [...(porEtapa.get(chave) ?? []), t]);
}

const maisRecenteDepois = (a, b) =>
  String(b.atualizadoEm ?? "").localeCompare(String(a.atualizadoEm ?? "")) ||
  String(b.criadoEm ?? "").localeCompare(String(a.criadoEm ?? ""));
const rotulo = (t) =>
  `${t.id} [${t.status}] pasta ${t.numero} regra="${regras.get(idRegra(t))?.nomeRegra ?? idRegra(t)}" dias=${regras.get(idRegra(t))?.parametros?.dias ?? "-"} praca=${t.praca}`;

let grupos = 0;
let excedentes = 0;
const avisos = [];
for (const [chave, lista] of porEtapa) {
  if (lista.length < 2) continue;
  const porAssinatura = new Map();
  for (const t of lista) {
    const k = assinaturaDaTarefa(t);
    porAssinatura.set(k, [...(porAssinatura.get(k) ?? []), t]);
  }
  if (porAssinatura.size > 1) avisos.push({ chave, lista });
  for (const copias of porAssinatura.values()) {
    if (copias.length < 2) continue;
    copias.sort((a, b) => Number(ehDaRegraOriginal(b)) - Number(ehDaRegraOriginal(a)) || maisRecenteDepois(a, b));
    const [manter, ...sobras] = copias;
    grupos++;
    const mesmaChave = new Set(copias.map((t) => t.chaveRegra)).size === 1;
    console.log(
      `Duplicata — ${manter.clienteNome ?? "?"} (${chave.split("|")[0]}), etapa ${codigoEtapa(manter.etapa)}, ` +
        `${mesmaChave ? "MESMA chave (falha de idempotência)" : "regras clonadas (mesma etapa/texto/destino, prazo diferente)"}`
    );
    console.log(`  = mantém  ${rotulo(manter)}`);
    for (const s of sobras) {
      const protegida = s.status === "pending_validation" ? " (já marcada como feita pela assistente)" : "";
      console.log(`  - ${aplicar ? (excluir ? "exclui" : "arquiva") : "sobra "}  ${rotulo(s)}${protegida}`);
      excedentes++;
      if (!aplicar) continue;
      if (excluir) await s.ref.delete();
      else
        await s.ref.update({
          status: "validated_done",
          duplicadaArquivada: true,
          atualizadoEm: new Date().toISOString(),
        });
    }
  }
}

if (avisos.length) {
  console.log(`\nAviso: ${avisos.length} pasta(s)/etapa(s) com tarefas de regras distintas — não tocadas:`);
  for (const { chave, lista } of avisos) {
    console.log(`  ${lista[0].clienteNome ?? "?"} (${chave}): ${lista.map((t) => `"${regras.get(idRegra(t))?.nomeRegra ?? t.tipoPendencia}"`).join(" + ")}`);
  }
}

console.log(`\n${grupos} grupo(s) duplicado(s); ${aplicar ? "tratada(s)" : "a tratar"}: ${excedentes} cópia(s).`);
process.exit(0);
