// Teste da régua progressiva (src/lib/services/reaproveitamentoCard.ts) — sem Firestore.
// Uso: node scripts/testar-reaproveitamento-card.mjs   (Node 22.6+/24 lê o .ts direto)
import assert from "node:assert/strict";
import { chaveDeReaproveitamento, registrarGatilho } from "../src/lib/services/reaproveitamentoCard.ts";

let falhas = 0;
const caso = (nome, fn) => {
  try {
    fn();
    console.log(`ok   ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHA ${nome}\n     ${e.message}`);
  }
};

const base = { origem: "linha", numero: "A1", etapa: "5.04 - Emissão de contratos - documentos pendentes", quadro: "analista" };

// Simula o trecho de reconciliarTarefa: índice por destino + criação/absorção.
function importar(indice, cards, regras, agora) {
  for (const r of regras) {
    const chave = chaveDeReaproveitamento(r);
    const existente = indice.get(chave ?? "");
    if (existente && existente.chaveRegra !== r.chaveRegra) {
      const { gatilhos, novoRegistro } = registrarGatilho(existente.gatilhosAcionados, {
        chaveRegra: r.chaveRegra, regraId: r.chaveRegra, dias: r.dias ?? null, descricao: r.nome, data: agora,
      });
      if (novoRegistro) existente.gatilhosAcionados = gatilhos;
      continue;
    }
    if (existente) continue; // mesma chave: atualização normal
    const card = { ...r, gatilhosAcionados: [] };
    cards.push(card);
    if (chave) indice.set(chave, card);
  }
}

caso("mesmo destino, prazos diferentes (0 e 2 dias) -> 1 card com 1 gatilho absorvido", () => {
  const indice = new Map(), cards = [];
  importar(indice, cards, [
    { ...base, chaveRegra: "R0", dias: 0, nome: "5.04" },
    { ...base, chaveRegra: "R2", dias: 2, nome: "5.04 (Cópia)" },
  ], "d1");
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].gatilhosAcionados.map((g) => g.chaveRegra), ["R2"]);
});

caso("a importação seguinte (mesmos dados) não duplica nem repete o gatilho", () => {
  const indice = new Map(), cards = [];
  const regras = [{ ...base, chaveRegra: "R0", dias: 0, nome: "a" }, { ...base, chaveRegra: "R2", dias: 2, nome: "b" }];
  importar(indice, cards, regras, "d1");
  importar(indice, cards, regras, "d2");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].gatilhosAcionados.length, 1);
});

caso("três prazos no mesmo destino (0, 3, 5) -> 1 card, 2 gatilhos", () => {
  const indice = new Map(), cards = [];
  importar(indice, cards, [0, 3, 5].map((d) => ({ ...base, chaveRegra: `R${d}`, dias: d, nome: `r${d}` })), "d1");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].gatilhosAcionados.length, 2);
});

caso("destino diferente (Analista -> Coordenador) abre card paralelo", () => {
  const indice = new Map(), cards = [];
  importar(indice, cards, [
    { ...base, chaveRegra: "RA", dias: 2, nome: "analista" },
    { ...base, quadro: "coordenador", chaveRegra: "RC", dias: 5, nome: "coordenador" },
  ], "d1");
  assert.equal(cards.length, 2);
});

caso("mesmo quadro mas pessoa diferente abre card paralelo", () => {
  const indice = new Map(), cards = [];
  importar(indice, cards, [
    { ...base, quadro: "layza", responsavelNome: "Laiza", chaveRegra: "R1", nome: "x" },
    { ...base, quadro: "layza", responsavelNome: "Catarina", chaveRegra: "R2", nome: "y" },
  ], "d1");
  assert.equal(cards.length, 2);
});

caso("pessoa com acento/caixa diferente conta como a mesma", () => {
  assert.equal(
    chaveDeReaproveitamento({ ...base, quadro: "layza", responsavelNome: "Catarina" }),
    chaveDeReaproveitamento({ ...base, quadro: "layza", responsavelNome: " CATÁRINA " })
  );
});

caso("etapas diferentes ou pastas diferentes não se misturam", () => {
  const indice = new Map(), cards = [];
  importar(indice, cards, [
    { ...base, chaveRegra: "R1", nome: "a" },
    { ...base, etapa: "5.17 - Assinatura", chaveRegra: "R2", nome: "b" },
    { ...base, numero: "A2", chaveRegra: "R3", nome: "c" },
  ], "d1");
  assert.equal(cards.length, 3);
});

caso("tarefa agregada ou sem pasta nunca é reaproveitada", () => {
  assert.equal(chaveDeReaproveitamento({ ...base, origem: "agregado" }), null);
  assert.equal(chaveDeReaproveitamento({ ...base, numero: null }), null);
});

console.log(falhas ? `\n${falhas} falha(s).` : "\nTodos os testes passaram.");
process.exit(falhas ? 1 : 0);
