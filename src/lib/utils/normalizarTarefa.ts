import type { Tarefa, NotaResolucao } from "@/lib/types";

/**
 * Normaliza dados de tarefa lidos do Firestore, garantindo compatibilidade
 * com dados legados e prevenindo erros de serialização.
 */
export function normalizarTarefa(tarefa: any): Tarefa {
  if (!tarefa) return tarefa;

  // Garantir que historicoNotas é um array válido
  let historicoNotas: NotaResolucao[] | undefined = undefined;
  if (Array.isArray(tarefa.historicoNotas)) {
    historicoNotas = tarefa.historicoNotas.filter(
      (n: any): n is NotaResolucao =>
        n && typeof n === "object" && typeof n.texto === "string"
    );
  }

  // Garantir que clientesEnvolvidos tem historicoNotas normalizado
  let clientesEnvolvidos = tarefa.clientesEnvolvidos;
  if (Array.isArray(clientesEnvolvidos)) {
    clientesEnvolvidos = clientesEnvolvidos.map((c: any) => {
      if (!c || typeof c !== "object") return c;

      let notasCliente: NotaResolucao[] | undefined = undefined;
      if (Array.isArray(c.historicoNotas)) {
        notasCliente = c.historicoNotas.filter(
          (n: any): n is NotaResolucao =>
            n && typeof n === "object" && typeof n.texto === "string"
        );
      }

      return {
        ...c,
        ...(notasCliente ? { historicoNotas: notasCliente } : {}),
      };
    });
  }

  return {
    ...tarefa,
    ...(historicoNotas !== undefined ? { historicoNotas } : {}),
    ...(clientesEnvolvidos !== undefined ? { clientesEnvolvidos } : {}),
  } as Tarefa;
}
