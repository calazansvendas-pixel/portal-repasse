import { normalize } from "@/lib/auth/roles";
import { somenteDigitos } from "@/lib/utils/cpf";

/** Um cliente da lista do Dossiê: a pasta principal e quantas pastas o mesmo CPF/CNPJ tem. */
export interface ClienteDossie {
  numero: string;
  clienteNome: string;
  cpfCnpj: string;
  produto: string;
  etapa: string;
  totalPastas: number;
}

export interface PastaResumo {
  numero: string;
  clienteNome?: string | null;
  cpfCnpj?: string | null;
  produto?: string | null;
  etapa?: string | null;
  arquivada?: boolean;
  atualizadoEm?: string | null;
}

/** A pasta principal de um cliente: a ativa antes da arquivada, depois a atualizada mais recentemente. */
function maisRelevante(a: PastaResumo, b: PastaResumo): PastaResumo {
  if (!!a.arquivada !== !!b.arquivada) return a.arquivada ? b : a;
  const porData = (b.atualizadoEm ?? "").localeCompare(a.atualizadoEm ?? "");
  if (porData !== 0) return porData > 0 ? b : a;
  return b.numero.localeCompare(a.numero, undefined, { numeric: true }) > 0 ? b : a;
}

/** Um item por CPF/CNPJ (sem documento, um por pasta), em ordem alfabética de nome. */
export function agruparClientes(pastas: PastaResumo[]): ClienteDossie[] {
  const grupos = new Map<string, { principal: PastaResumo; total: number }>();
  for (const pasta of pastas) {
    const documento = somenteDigitos(pasta.cpfCnpj);
    const chave = documento || `pasta:${pasta.numero}`;
    const grupo = grupos.get(chave);
    if (!grupo) grupos.set(chave, { principal: pasta, total: 1 });
    else grupos.set(chave, { principal: maisRelevante(grupo.principal, pasta), total: grupo.total + 1 });
  }
  return [...grupos.values()]
    .map(({ principal: p, total }) => ({
      numero: p.numero,
      clienteNome: p.clienteNome?.trim() || `Pasta ${p.numero}`,
      cpfCnpj: p.cpfCnpj ?? "",
      produto: p.produto?.trim() ?? "",
      etapa: p.etapa?.trim() ?? "",
      totalPastas: total,
    }))
    .sort((a, b) => a.clienteNome.localeCompare(b.clienteNome, "pt-BR", { sensitivity: "base" }));
}

/** Nome comparável: sem acento, caixa, pontuação nem espaços repetidos. */
function nomeComparavel(texto: string): string {
  return normalize(texto)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Filtro em tempo real: só números e pontuação = busca no CPF/CNPJ (pelos dígitos); com letras =
 * busca no nome, e todas as palavras digitadas precisam aparecer.
 */
export function filtrarClientes(clientes: ClienteDossie[], termo: string): ClienteDossie[] {
  const texto = termo.trim();
  if (!texto) return clientes;
  if (!/\p{L}/u.test(texto)) {
    const digitos = somenteDigitos(texto);
    return digitos ? clientes.filter((c) => somenteDigitos(c.cpfCnpj).includes(digitos)) : clientes;
  }
  const palavras = nomeComparavel(texto).split(" ").filter(Boolean);
  return clientes.filter((c) => {
    const nome = nomeComparavel(c.clienteNome);
    return palavras.every((p) => nome.includes(p));
  });
}
