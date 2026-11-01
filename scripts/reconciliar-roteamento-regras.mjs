// Reatribui o quadro/responsável das tarefas ATIVAS para bater 100% com o destino que a regra
// cadastrada no Motor de Regras (regras_auditoria) determina — a mesma resolução de
// resolverDestinoLinha (src/lib/services/dynamicRuleEngine.ts), sem nenhum "praça X -> pessoa Y"
// fixo neste script:
//   1) regra com destino "pessoa"  -> o colaborador/quadro da regra;
//   2) cargo "assistente"          -> Matriz de Empreendimentos (inclui a regra fixa Morada
//                                     Vitória/2.051), senão o Mapeamento de Praças por cidade;
//   3) cargo coordenador/analista  -> o próprio quadro.
// Preservados (só listados): override manual da Gerência, tarefas avulsas, tarefas cuja regra não
// existe mais ou cujo destino não é uma única pessoa (agregadas).
//
// Uso: npm run reconciliar:roteamento          (simulação, não grava nada)
//      npm run reconciliar:roteamento -- --apply

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
const db = getFirestore(initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }));

const normalize = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
const codigoEtapa = (e) => String(e ?? "").trim().split(" - ")[0]?.trim() || String(e ?? "").trim();
const semPreposicao = (v) =>
  normalize(v)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !["de", "da", "do", "das", "dos"].includes(p))
    .join(" ");

// Espelho de CIDADES_FILTRO (roles.ts) — padrão do Mapeamento de Praças, só como último fallback.
const CIDADES = [
  { chave: "serra", praca: "layza" },
  { chave: "vila velha", praca: "eliane" },
  { chave: "fatima", praca: "catharina" },
  { chave: "camburi", praca: "catharina" },
];
const pracaPorCidade = (cidade, overrides) => {
  const alvo = normalize(cidade);
  const entrada = CIDADES.find((c) => alvo.includes(c.chave));
  return entrada ? overrides?.[entrada.chave] ?? entrada.praca : null;
};

// Espelho de resolveRegraFixaEtapa (roles.ts): Morada Vitória + 2.051 -> Catharina.
const ehMoradaVitoria2051 = (produto, etapa, titulos) => {
  const textos = [etapa, ...titulos].map((t) => String(t ?? ""));
  if (![produto, ...textos].some((t) => semPreposicao(t).includes("morada vitoria"))) return false;
  const cod = codigoEtapa(textos[0]);
  return cod === "2.051" || Number(cod) === 2.051 || textos.some((t) => /(^|[^0-9.])2\.051(?![0-9])/.test(t));
};

const [regrasSnap, pracasSnap, matrizSnap, catharinaSnap] = await Promise.all([
  db.collection("regras_auditoria").get(),
  db.collection("configuracoes").doc("mapeamentoPracas").get(),
  db.collection("configuracoes").doc("mapeamentoEmpreendimentos").get(),
  db.collection("users").where("praca", "==", "catharina").get(),
]);
const regras = new Map(regrasSnap.docs.map((d) => [d.id, d.data()]));
const pracaOverrides = pracasSnap.data()?.overrides ?? null;
const matriz = matrizSnap.data()?.overrides ?? null;
const catharinas = catharinaSnap.docs.filter((d) => d.data().ativo !== false);
const catharina = catharinas.length === 1 ? { id: catharinas[0].id, nome: catharinas[0].data().nome } : null;

function destinoDaRegra(regra, produto, tarefa, registro) {
  if (regra.destinoTipo === "pessoa") {
    return regra.pessoaQuadro
      ? { quadro: regra.pessoaQuadro, responsavelId: regra.pessoaId ?? null, responsavelNome: regra.pessoaNome ?? null }
      : null;
  }
  if (regra.cargoDestino === "assistente") {
    if (ehMoradaVitoria2051(produto, tarefa.etapa, [tarefa.tipoPendencia, registro?.etapa])) {
      const daMatriz = Object.values(matriz ?? {})
        .flatMap((l) => l ?? [])
        .find((a) => a.quadro === "catharina");
      return {
        quadro: "catharina",
        responsavelId: daMatriz?.colaboradorId ?? catharina?.id ?? null,
        responsavelNome: daMatriz?.colaboradorNome ?? catharina?.nome ?? "Catharina",
      };
    }
    const atribuicao = (matriz?.[normalize(produto)] ?? []).find((a) => a.etapas.includes(codigoEtapa(tarefa.etapa)));
    if (atribuicao) {
      return { quadro: atribuicao.quadro, responsavelId: atribuicao.colaboradorId || null, responsavelNome: atribuicao.colaboradorNome };
    }
    const quadro = pracaPorCidade(tarefa.cidade, pracaOverrides);
    return quadro ? { quadro, responsavelId: null, responsavelNome: null } : null;
  }
  if (regra.cargoDestino === "coordenador" || regra.cargoDestino === "analista") {
    return { quadro: regra.cargoDestino, responsavelId: null, responsavelNome: null };
  }
  return null;
}

const snap = await db.collection("tarefas").where("status", "in", ["pendente", "pending_validation", "audit_failed"]).get();
console.log(`${snap.size} tarefa(s) ativa(s) lida(s), ${regras.size} regra(s). Modo: ${aplicar ? "APLICAR" : "SIMULAÇÃO"}\n`);

let alteradas = 0;
for (const doc of snap.docs) {
  const t = doc.data();
  if (t.origem === "manual") continue;
  const rotulo = `${doc.id} (pasta ${t.numero}, ${t.tipoPendencia}) praca=${t.praca} responsavel=${t.responsavelNome ?? "-"}`;
  const idRegra = /^DINAMICA::([^:]+)::/.exec(t.chaveRegra ?? "")?.[1];
  const regra = idRegra ? regras.get(idRegra) : null;
  if (!regra) continue; // agregadas/sem regra: nada a reatribuir por aqui
  if (t.pracaCustomizada || t.responsavelCustomizadoId || t.overrideManual) {
    console.log(`~ ${rotulo}: override manual — preservado`);
    continue;
  }
  const registro = t.numero ? (await db.collection("registros").doc(t.numero).get()).data() : null;
  const destino = destinoDaRegra(regra, registro?.produto, t, registro);
  if (!destino) {
    console.log(`? ${rotulo}: regra "${regra.nomeRegra}" não aponta um destino único — preservado`);
    continue;
  }
  if (t.praca === destino.quadro && (t.responsavelNome ?? null) === destino.responsavelNome) continue;
  console.log(
    `+ ${rotulo} -> ${destino.quadro}${destino.responsavelNome ? ` (${destino.responsavelNome})` : ""} [regra "${regra.nomeRegra}"]`
  );
  if (aplicar) {
    await doc.ref.update({
      praca: destino.quadro,
      responsavelId: destino.responsavelId,
      responsavelNome: destino.responsavelNome,
      atualizadoEm: new Date().toISOString(),
    });
  }
  alteradas++;
}

console.log(`\n${aplicar ? "Corrigida(s)" : "A corrigir"}: ${alteradas} tarefa(s).`);
process.exit(0);
