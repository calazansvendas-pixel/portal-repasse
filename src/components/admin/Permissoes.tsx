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
  roleDoCargo,
  rotuloCompleto,
  statusDoPerfil,
  temPermissao,
  type CargoId,
  type PermissaoId,
} from "@/lib/auth/cargos";
import {
  MENUS,
  calcularMenus,
  menuTravado,
  motivoIndisponivel,
  temMenu,
  type MenuId,
  type MenusParciais,
} from "@/lib/auth/menus";
import type { UsuarioPainel } from "@/lib/server/usuarios";
import type { UserProfile } from "@/lib/types";
import type { Admin } from "./useAdmin";
import { Botao, Interruptor, Rotulo } from "./ui";

/** "Permissões de Edição por Colaborador": matriz pessoa × permissão e menu, gravada na hora. */
export function MatrizPermissoes({ usuarios, todos, eu, admin }: { usuarios: UsuarioPainel[]; todos: UsuarioPainel[]; eu: UserProfile; admin: Admin }) {
  const linhas = [...usuarios].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (!linhas.length) return <p className="p-6 text-center text-sm text-ink-muted">Ninguém para mostrar.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1220px] border-collapse text-xs">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
            <th rowSpan={2} className="sticky left-0 z-10 bg-surface px-4 py-2 text-left sm:px-5 dark:bg-[#1B1E17]">
              Colaborador
            </th>
            <th colSpan={PERMISSOES.length} className="px-2 pt-3 text-center text-brand-primary">
              Permissões de edição
            </th>
            <th colSpan={MENUS.length} className="border-l border-border px-2 pt-3 text-center text-brand-primary dark:border-white/10">
              Menus visíveis na barra lateral
            </th>
            <th rowSpan={2} className="px-3 py-2" />
          </tr>
          <tr className="align-bottom text-[10px] font-bold uppercase tracking-wide text-ink-muted">
            {PERMISSOES.map((p) => (
              <th key={p.id} className="px-2 py-2 text-center" title={p.nome}>
                {p.curto}
              </th>
            ))}
            {MENUS.map((m, i) => (
              <th key={m.id} className={`max-w-[92px] px-2 py-2 text-center ${i === 0 ? "border-l border-border dark:border-white/10" : ""}`}>
                {m.curto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((u) => {
            const efetivas = calcularPermissoes(u, admin.permissoesPorCargo);
            const trava = u.uid === eu.uid ? "Você não pode alterar as próprias permissões." : travaDoAlvo(eu, u, todos);
            const alterar = (id: PermissaoId, ligado: boolean) =>
              admin.agir(u.uid, { tipo: "permissoes", permissoesIndividuais: { ...u.permissoesIndividuais, [id]: ligado } });
            const menus = calcularMenus(u, admin.permissoesPorCargo, admin.menusPorCargo);
            const alterarMenu = (id: MenuId, ligado: boolean) =>
              admin.agir(u.uid, {
                tipo: "permissoes",
                permissoesIndividuais: u.permissoesIndividuais ?? {},
                menusPermitidos: { ...u.menusPermitidos, [id]: ligado },
              });
            const ajustado = Object.keys({ ...u.permissoesIndividuais, ...u.menusPermitidos }).length > 0;
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
                {MENUS.map((m, i) => {
                  const travado = menuTravado(u.cargo, m.id);
                  const motivo = motivoIndisponivel(m.id, u.role, efetivas);
                  const semDireito = !menus[m.id] && !temMenu(eu, m.id);
                  return (
                    <td key={m.id} className={`px-2 py-2.5 text-center ${i === 0 ? "border-l border-border dark:border-white/10" : ""}`}>
                      <Interruptor
                        rotulo={`${u.nome}: ${m.curto}`}
                        ligado={menus[m.id]}
                        desabilitado={!!trava || travado || !!motivo || semDireito || admin.ocupado === u.uid}
                        titulo={
                          trava ??
                          (travado ? "Sempre liberado para este cargo" : (motivo ?? (semDireito ? "Você não tem esse menu para liberar" : m.curto)))
                        }
                        onChange={(ligado) => alterarMenu(m.id, ligado)}
                      />
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {!trava && ajustado && (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-brand-primary hover:underline"
                      title="Remover os ajustes individuais e voltar ao padrão do cargo"
                      onClick={() => admin.agir(u.uid, { tipo: "permissoes", permissoesIndividuais: {}, menusPermitidos: {} })}
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
  const [rascunhoMenus, setRascunhoMenus] = useState<MenusParciais>({});
  const [confirmando, setConfirmando] = useState(false);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const atuais = { ...padraoDoCargo(cargo), ...admin.permissoesPorCargo[cargo], ...rascunho };
  const role = roleDoCargo(cargo);
  const comTravas = { ...atuais };
  for (const { id } of PERMISSOES) if (permissaoTravada(cargo, id)) comTravas[id] = true;
  const menus = calcularMenus({ cargo, role }, { [cargo]: comTravas }, { [cargo]: { ...admin.menusPorCargo[cargo], ...rascunhoMenus } });
  const afetados = usuarios.filter((u) => u.cargo === cargo && ["ativo", "pausado"].includes(statusDoPerfil(u))).length;

  async function salvar() {
    setSalvando(true);
    const erro = await admin.salvarPermissoesDoCargo(cargo, atuais, rascunhoMenus);
    setSalvando(false);
    setConfirmando(false);
    if (!erro) {
      setRascunho({});
      setRascunhoMenus({});
    }
    setMensagem({ ok: !erro, texto: erro ?? "Permissões e menus do cargo salvos." });
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
            setRascunhoMenus({});
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
          : "Ninguém com este cargo ainda; quem for aprovado nele já nasce com estas permissões e menus."}{" "}
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
      <fieldset className="max-w-2xl border-t border-border pt-4 dark:border-white/10">
        <legend className="float-left mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">Menus Visíveis na Barra Lateral</legend>
        <ul className="clear-both flex flex-col gap-1">
          {MENUS.map((m) => {
            const travado = menuTravado(cargo, m.id);
            const motivo = motivoIndisponivel(m.id, role, comTravas);
            const semDireito = !menus[m.id] && !temMenu(eu, m.id);
            const bloqueado = travado || !!motivo || semDireito;
            return (
              <li key={m.id}>
                <label className={`flex min-h-[32px] items-center gap-2.5 text-xs text-ink-primary dark:text-white ${bloqueado ? "cursor-not-allowed" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-brand-primary disabled:opacity-40"
                    checked={menus[m.id]}
                    disabled={bloqueado}
                    onChange={(e) => {
                      setRascunhoMenus((r) => ({ ...r, [m.id]: e.target.checked }));
                      setMensagem(null);
                    }}
                  />
                  <span>
                    {m.nome}
                    {(travado || motivo || semDireito) && (
                      <span className="ml-1.5 text-[11px] text-ink-muted">
                        · {travado ? "sempre liberado" : (motivo ?? "você não tem esse menu para liberar")}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
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
