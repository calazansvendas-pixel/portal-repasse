// Dados pessoais do cadastro: máscaras (as mesmas do padrão Morar) e validação.

export interface DadosPessoais {
  nome: string;
  telefone: string;
  cpf: string;
  creci: string;
  dataNascimento: string; // yyyy-MM-dd
  imobiliaria: string;
}

export function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  const padrao = d.length > 10 ? /^(\d{0,2})(\d{0,5})(\d{0,4})$/ : /^(\d{0,2})(\d{0,4})(\d{0,4})$/;
  return d.replace(padrao, (_, a: string, b: string, c: string) => {
    let s = "";
    if (a) s += "(" + a + (a.length === 2 ? ") " : "");
    s += b;
    if (c) s += "-" + c;
    return s;
  });
}

export function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2})$/, (_, a: string, b: string, c: string, e: string) => {
    let s = a;
    if (b) s += "." + b;
    if (c) s += "." + c;
    if (e) s += "-" + e;
    return s;
  });
}

const OBRIGATORIOS: [keyof DadosPessoais, string][] = [
  ["nome", "Nome completo"],
  ["dataNascimento", "Data de nascimento"],
  ["telefone", "Telefone"],
  ["cpf", "CPF"],
  ["imobiliaria", "Imobiliária / Equipe / Loja"],
];
const CAMPOS: (keyof DadosPessoais)[] = ["nome", "telefone", "cpf", "creci", "dataNascimento", "imobiliaria"];

/**
 * Lê e valida os dados vindos de fora; devolve a mensagem de erro quando inválidos.
 * `parcial` (edição pelo painel): só os campos enviados, e podem ficar em branco (exceto o nome),
 * porque contas antigas não têm esses dados.
 */
export function lerDadosPessoais(bruto: unknown, opcoes: { parcial: true }): Partial<DadosPessoais> | string;
export function lerDadosPessoais(bruto: unknown): DadosPessoais | string;
export function lerDadosPessoais(bruto: unknown, opcoes?: { parcial: boolean }): Partial<DadosPessoais> | string {
  const origem = (bruto ?? {}) as Record<string, unknown>;
  const dados: Partial<DadosPessoais> = {};
  for (const campo of CAMPOS) {
    if (opcoes?.parcial && origem[campo] === undefined) continue;
    const valor = typeof origem[campo] === "string" ? (origem[campo] as string).trim() : "";
    if (valor.length > 120) return "Há um campo longo demais.";
    dados[campo] = valor;
  }
  if (opcoes?.parcial) {
    if (dados.nome === "") return "Informe o nome completo.";
  } else {
    const vazio = OBRIGATORIOS.find(([campo]) => !dados[campo]);
    if (vazio) return `Preencha o campo "${vazio[1]}".`;
    if (dados.cpf!.replace(/\D/g, "").length !== 11) return "CPF incompleto.";
    if (dados.telefone!.replace(/\D/g, "").length < 10) return "Telefone incompleto.";
  }
  const nascimento = dados.dataNascimento;
  if (nascimento) {
    const data = new Date(`${nascimento}T00:00:00Z`);
    const valida = /^\d{4}-\d{2}-\d{2}$/.test(nascimento) && !Number.isNaN(data.getTime()) && data.toISOString().startsWith(nascimento);
    if (!valida || data.getTime() > Date.now() || data.getUTCFullYear() < 1900) return "Data de nascimento inválida.";
  }
  return dados;
}
