/** Avisos rápidos (toast) — por enquanto só erros que acontecem em segundo plano. */
export interface Aviso {
  id: number;
  mensagem: string;
}

const SEM_AVISOS: readonly Aviso[] = [];
let avisos: readonly Aviso[] = SEM_AVISOS;
let proximoId = 1;
const ouvintes = new Set<() => void>();

function publicar(novos: readonly Aviso[]) {
  avisos = novos;
  ouvintes.forEach((ouvir) => ouvir());
}

export function assinarAvisos(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => {
    ouvintes.delete(ouvir);
  };
}

export const lerAvisos = () => avisos;
export const lerAvisosNoServidor = () => SEM_AVISOS;

export function fecharAviso(id: number) {
  publicar(avisos.filter((a) => a.id !== id));
}

/** Mostra o aviso por alguns segundos (ou até a pessoa fechar). */
export function avisar(mensagem: string, duracaoMs = 10000) {
  const id = proximoId++;
  publicar([...avisos, { id, mensagem }]);
  setTimeout(() => fecharAviso(id), duracaoMs);
}
