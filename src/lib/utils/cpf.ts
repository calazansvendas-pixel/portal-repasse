/** Remove tudo que não é dígito — usado tanto para formatar quanto para comparar na busca. */
export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** "00000000000" -> "000.000.000-00" (CPF, 11 dígitos) ou "00.000.000/0001-00" (CNPJ, 14 dígitos).
 * Qualquer outra quantidade de dígitos (planilha com valor incompleto/mal digitado) volta como
 * veio, sem máscara — melhor mostrar o dado bruto do que inventar uma formatação errada. */
export function formatarCpfCnpj(valor: string | null | undefined): string {
  const digitos = somenteDigitos(valor);
  if (digitos.length === 11) {
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digitos.length === 14) {
    return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return (valor ?? "").trim();
}
