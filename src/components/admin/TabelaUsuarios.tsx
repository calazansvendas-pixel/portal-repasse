"use client";

import { useState, type ReactNode } from "react";
import { Ban, Pencil, PlayCircle, Trash2, Undo2 } from "lucide-react";
import { travaDoAlvo, travaPausaOuExclusao } from "@/lib/auth/acoesUsuario";
import { cargosAcumulados, nomeDoCargo, rotuloDoPerfil, statusDoPerfil } from "@/lib/auth/cargos";
import type { UsuarioPainel } from "@/lib/server/usuarios";
import type { UserProfile } from "@/lib/types";
import type { Admin } from "./useAdmin";
import { Botao, PilulaCargo, PilulaStatus } from "./ui";

const COLUNAS = "md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_90px_minmax(0,1.8fr)] md:items-center md:gap-3";

/** No celular cada linha vira um cartão, com o nome da coluna acima do valor. */
function Celula({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-muted md:hidden">{rotulo}</span>
      {children}
    </div>
  );
}

/** Tabela NOME | CARGO | SUPERIOR | STATUS | AÇÕES (ativos, pausados e excluídos). */
export function TabelaUsuarios({
  usuarios,
  todos,
  eu,
  admin,
  onEditar,
}: {
  usuarios: UsuarioPainel[];
  todos: UsuarioPainel[];
  eu: UserProfile;
  admin: Admin;
  onEditar: (u: UsuarioPainel) => void;
}) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const ordenados = [...usuarios].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="text-xs">
      <div className={`hidden border-b border-border px-5 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-muted dark:border-white/10 ${COLUNAS}`}>
        <span>Nome</span>
        <span>Cargo</span>
        <span>Superior</span>
        <span>Status</span>
        <span>Ações</span>
      </div>
      <ul className="divide-y divide-border dark:divide-white/10">
        {ordenados.map((u) => {
          const status = statusDoPerfil(u);
          const trava = travaDoAlvo(eu, u, todos);
          const travaSaida = trava ?? travaPausaOuExclusao(eu, u);
          const ocupado = admin.ocupado === u.uid;
          return (
            <li key={u.uid} className={`flex flex-col gap-2 px-4 py-3 sm:px-5 ${COLUNAS}`}>
              <div className="min-w-0">
                <p className="truncate font-bold text-ink-primary dark:text-white" title={u.nome}>
                  {u.nome}
                  {u.uid === eu.uid && <span className="ml-1.5 text-[10px] uppercase text-ink-muted">você</span>}
                </p>
                <p className="truncate text-ink-muted" title={u.email}>
                  {u.email}
                </p>
              </div>
              <Celula rotulo="Cargo">
                <span className="flex flex-wrap gap-1">
                  <PilulaCargo>{rotuloDoPerfil(u)}</PilulaCargo>
                  {cargosAcumulados(u).map((c) => (
                    <PilulaCargo key={c}>{nomeDoCargo(c)}</PilulaCargo>
                  ))}
                </span>
              </Celula>
              <Celula rotulo="Superior">
                <p className="break-words text-ink-secondary dark:text-white/70">
                  {u.superiorNome ? `${u.superiorNome} — ${u.superiorCargo ?? "Sem cargo"}` : "—"}
                </p>
              </Celula>
              <Celula rotulo="Status">
                <PilulaStatus status={status} recusado={u.recusado} />
              </Celula>
              <Celula rotulo="Ações">
                {confirmando === u.uid ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-status-danger">Excluir esta conta?</span>
                    <Botao
                      tom="perigo"
                      disabled={ocupado}
                      onClick={async () => {
                        await admin.agir(u.uid, { tipo: "excluir" });
                        setConfirmando(null);
                      }}
                    >
                      Sim, excluir
                    </Botao>
                    <Botao onClick={() => setConfirmando(null)}>Cancelar</Botao>
                  </div>
                ) : status === "excluido" ? (
                  <Botao tom="editar" disabled={ocupado || !!trava} title={trava ?? undefined} onClick={() => admin.agir(u.uid, { tipo: "restaurar" })}>
                    <Undo2 size={14} /> Restaurar
                  </Botao>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    <Botao tom="editar" disabled={!!trava} title={trava ?? undefined} onClick={() => onEditar(u)}>
                      <Pencil size={14} /> Editar
                    </Botao>
                    {status === "pausado" ? (
                      <Botao tom="verde" disabled={ocupado || !!trava} title={trava ?? undefined} onClick={() => admin.agir(u.uid, { tipo: "reativar" })}>
                        <PlayCircle size={14} /> Reativar
                      </Botao>
                    ) : (
                      <Botao disabled={ocupado || !!travaSaida} title={travaSaida ?? "Pausar conta"} onClick={() => admin.agir(u.uid, { tipo: "pausar" })}>
                        <Ban size={14} /> Pausar
                      </Botao>
                    )}
                    <Botao disabled={ocupado || !!travaSaida} title={travaSaida ?? "Excluir conta"} onClick={() => setConfirmando(u.uid)}>
                      <Trash2 size={14} /> Excluir
                    </Botao>
                  </div>
                )}
              </Celula>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
