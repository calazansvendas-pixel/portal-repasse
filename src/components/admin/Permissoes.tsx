"use client";

import { useState } from "react";
import { travaDoAlvo, travaDoCargo } from "@/lib/auth/acoesUsuario";
import {
  CARGOS,
  PERMISSOES,
  calcularPermissoes,
  nomeDoCargo,
  padraoDoCargo,
  permissaoTravada,
  rotuloCompleto,
  statusDoPerfil,
  temPermissao,
  type CargoId,
  type PermissaoId,
} from "@/lib/auth/cargos";
import type { UsuarioPainel } from "@/lib/server/usuarios";
import type { UserProfile } from "@/lib/types";
import type { Admin } from "./useAdmin";
import { Botao, Interruptor, Rotulo } from "./ui";

/** "Permissões de Edição por Colaborador": matriz pessoa × módulo, gravada na hora. */
export function MatrizPermissoes({ usuarios, todos, eu, admin }: { usuarios: UsuarioPainel[]; todos: UsuarioPainel[]; eu: UserProfile; admin: Admin }) {
  const linhas = [...usuarios].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (!linhas.length) return <p className="p-6 text-center text-sm text-ink-muted">Ninguém para mostrar.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-xs">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
            <th className="sticky left-0 z-10 bg-surface px-4 py-2 text-left sm:px-5 dark:bg-[#1B1E17]">Colaborador</th>
            {PERMISSOES.map((p) => (
              <th key={p.id} className="px-2 py-2 text-center" title={p.nome}>
                {p.curto}
              </th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {linhas.map((u) => {
            const efetivas = calcularPermissoes(u, admin.permissoesPorCargo);
            const trava = u.uid === eu.uid ? "Você não pode alterar as próprias permissões." : travaDoAlvo(eu, u, todos);
            const alterar = (id: PermissaoId, ligado: boolean) =>
              admin.agir(u.uid, { tipo: "permissoes", permissoesIndividuais: { ...u.permissoesIndividuais, [id]: ligado } });
            return (
              <tr key={u.uid} className="border-t border-border dark:border-white/10">
                <td className="sticky left-0 z-10 max-w-[200px] bg-surface px-4 py-2.5 sm:px-5 dark:bg-[#1B1E17]">
                  <p className="truncate font-bold text-ink-primary dark:text-white">{u.nome}</p>
                  <p className="truncate text-[11px] text-ink-muted" title={rotuloCompleto(u)}>{rotuloCompleto(u)}</p>
                </td>
                {PERMISSOES.map((p) => {
                  const travada = permissaoTravada(u.cargo, p.id);
                  const semDireito = !efetivas[p.id] && !temPermissao(eu, p.id);
                  return (
                    <td key={p.id} className="px-2 py-2.5 text-center">
                      <Interruptor
                        rotulo={`${u.nome}: ${p.nome}`}
                        ligado={efetivas[p.id]}
                        desabilitado={!!trava || travada || semDireito || admin.ocupado === u.uid}
                        titulo={trava ?? (travada ? "Sempre liberado para este cargo" : semDireito ? "Você não tem essa permissão para liberar" : p.nome)}
                        onChange={(ligado) => alterar(p.id, ligado)}
                      />
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {!trava && Object.keys(u.permissoesIndividuais ?? {}).length > 0 && (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-brand-primary hover:underline"
                      title="Remover os ajustes individuais e voltar ao padrão do cargo"
                      onClick={() => admin.agir(u.uid, { tipo: "permissoes", permissoesIndividuais: {} })}
                    >
                      Padrão
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Editar Permissões do Cargo": o padrão de acesso de cada um dos 14 cargos. */
export function PermissoesDoCargo({ usuarios, eu, admin }: { usuarios: UsuarioPainel[]; eu: UserProfile; admin: Admin }) {
  const disponiveis = CARGOS.filter((c) => c.id !== "dono" && !travaDoCargo(eu, c.id));
  const [cargo, setCargo] = useState<CargoId>(disponiveis[0]?.id ?? "administrador");
  const [rascunho, setRascunho] = useState<Partial<Record<PermissaoId, boolean>>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const atuais = { ...padraoDoCargo(cargo), ...admin.permissoesPorCargo[cargo], ...rascunho };
  const afetados = usuarios.filter((u) => u.cargo === cargo && ["ativo", "pausado"].includes(statusDoPerfil(u))).length;

  async function salvar() {
    setSalvando(true);
    const erro = await admin.salvarPermissoesDoCargo(cargo, atuais);
    setSalvando(false);
    setConfirmando(false);
    if (!erro) setRascunho({});
    setMensagem({ ok: !erro, texto: erro ?? "Permissões do cargo salvas." });
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <label className="block max-w-xs">
        <Rotulo>Cargo</Rotulo>
        <select
          className="input-field"
          value={cargo}
          onChange={(e) => {
            setCargo(e.target.value as CargoId);
            setRascunho({});
            setConfirmando(false);
            setMensagem(null);
          }}
        >
          {disponiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-ink-muted">
        {afetados
          ? `${afetados} conta${afetados === 1 ? "" : "s"} com este cargo hoje. Ajustes individuais continuam valendo por cima do padrão.`
          : "Ninguém com este cargo ainda; quem for aprovado nele já nasce com estas permissões."}{" "}
        O Dono tem sempre todas.
      </p>
      <ul className="flex max-w-2xl flex-col gap-2">
        {PERMISSOES.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 text-xs text-ink-primary dark:text-white">
            <span>{p.nome}</span>
            <Interruptor
              rotulo={p.nome}
              ligado={permissaoTravada(cargo, p.id) || atuais[p.id]}
              desabilitado={permissaoTravada(cargo, p.id)}
              onChange={(ligado) => {
                setRascunho((r) => ({ ...r, [p.id]: ligado }));
                setMensagem(null);
              }}
            />
          </li>
        ))}
      </ul>
      {mensagem && <p className={`text-xs ${mensagem.ok ? "text-status-success" : "text-status-danger"}`}>{mensagem.texto}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3 dark:border-white/10">
        {confirmando ? (
          <>
            <span className="text-xs font-semibold text-status-warning">
              Salvar muda o acesso de {afetados} conta{afetados === 1 ? "" : "s"}. Confirma?
            </span>
            <Botao tom="verde" disabled={salvando} onClick={salvar}>
              {salvando ? "Salvando…" : "Sim, salvar"}
            </Botao>
            <Botao onClick={() => setConfirmando(false)}>Cancelar</Botao>
          </>
        ) : (
          <Botao tom="verde" onClick={() => setConfirmando(true)}>
            Salvar permissões do cargo {nomeDoCargo(cargo)}
          </Botao>
        )}
      </div>
    </div>
  );
}
