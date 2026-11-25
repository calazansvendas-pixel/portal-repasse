"use client";

import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { enxergaTodos } from "@/lib/auth/acoesUsuario";
import { CARGOS, cargosAcumulados, statusDoPerfil, type StatusConta } from "@/lib/auth/cargos";
import { temMenu } from "@/lib/auth/menus";
import { Topbar } from "@/components/layout/Topbar";
import { useAdmin } from "@/components/admin/useAdmin";
import { Pendentes } from "@/components/admin/Pendentes";
import { TabelaUsuarios } from "@/components/admin/TabelaUsuarios";
import { ModalEditarUsuario } from "@/components/admin/ModalEditarUsuario";
import { MatrizPermissoes, PermissoesDoCargo } from "@/components/admin/Permissoes";
import { Botao, Rotulo, Secao } from "@/components/admin/ui";
import type { UsuarioPainel } from "@/lib/server/usuarios";
import { normalize } from "@/lib/auth/roles";
import { cn } from "@/lib/utils/cn";

const LEGADO = "legado";

export default function PainelAdministradorPage() {
  const { profile } = useAuth();
  const podeVer = !!profile && temMenu(profile, "painel_admin");
  const admin = useAdmin(podeVer);
  const [busca, setBusca] = useState("");
  const [cargo, setCargo] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  if (!profile) return null;
  if (!podeVer) {
    return (
      <div>
        <Topbar titulo="Painel do Administrador" />
        <p className="text-sm text-ink-muted">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  const { usuarios, carregando, erro } = admin;
  const filtrando = !!busca.trim() || !!cargo;
  const termo = normalize(busca);
  const passa = (u: UsuarioPainel) => {
    const cargosDele: (string | undefined)[] =
      statusDoPerfil(u) === "pendente" ? [u.cargoPretendido] : [u.cargo, ...cargosAcumulados(u)];
    if (cargo === LEGADO ? !!u.cargo || statusDoPerfil(u) === "pendente" : cargo && !cargosDele.includes(cargo)) return false;
    return !termo || normalize([u.nome, u.email, u.cpf, u.telefone, u.imobiliaria, u.creci].filter(Boolean).join(" ")).includes(termo);
  };
  const doStatus = (status: StatusConta) => usuarios.filter((u) => statusDoPerfil(u) === status);
  const pendentes = doStatus("pendente");
  const ativos = doStatus("ativo");
  const pausados = doStatus("pausado");
  const excluidos = doStatus("excluido");

  const blocos = [
    ...CARGOS.map((c) => ({ id: c.id as string, nome: c.nome as string, lista: ativos.filter((u) => u.cargo === c.id) })),
    { id: LEGADO, nome: "Outros / Legado", lista: ativos.filter((u) => !CARGOS.some((c) => c.id === u.cargo)) },
  ]
    .map((b) => ({ ...b, filtrados: b.lista.filter(passa) }))
    // Buscando ou filtrando, blocos sem resultado somem; o de legado some quando esvazia.
    .filter((b) => (filtrando ? b.filtrados.length > 0 : b.id !== LEGADO || b.lista.length > 0));

  const tabela = (lista: UsuarioPainel[]) => (
    <TabelaUsuarios usuarios={lista} todos={usuarios} eu={profile} admin={admin} onEditar={(u) => setEditandoId(u.uid)} />
  );
  const vazio = (texto: string) => <p className="p-6 text-center text-sm text-ink-muted">{texto}</p>;
  const editando = usuarios.find((u) => u.uid === editandoId);

  return (
    <div className="flex flex-col gap-4">
      <Topbar titulo="Painel do Administrador" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-secondary dark:text-white/60">
          Aprovações, cargos, status das contas e permissões de cada colaborador.
          {!enxergaTodos(profile) && " Você vê a sua equipe e os cadastros pendentes."}
        </p>
        <Botao onClick={() => admin.recarregar()} disabled={carregando}>
          <RefreshCw size={14} className={cn(carregando && "animate-spin")} /> Atualizar
        </Botao>
      </div>

      {erro && <p className="rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">{erro}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { n: pendentes.length, rotulo: "Pendentes de aprovação", cor: "text-status-warning" },
          { n: ativos.length, rotulo: "Usuários ativos", cor: "text-brand-primary" },
          { n: pausados.length, rotulo: "Contas pausadas", cor: "text-ink-secondary" },
        ].map((c) => (
          <div key={c.rotulo} className="surface-card p-4">
            <p className={cn("font-display text-2xl font-bold tabular-nums", c.cor)}>{c.n}</p>
            <p className="text-xs text-ink-secondary dark:text-white/60">{c.rotulo}</p>
          </div>
        ))}
      </div>

      <div className="surface-card grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:p-5">
        <label className="block">
          <Rotulo>Buscar</Rotulo>
          <span className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="input-field pl-9" placeholder="Nome, e-mail, CPF, imobiliária…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </span>
        </label>
        <label className="block">
          <Rotulo>Cargo</Rotulo>
          <select className="input-field" value={cargo} onChange={(e) => setCargo(e.target.value)}>
            <option value="">Todos os cargos</option>
            {CARGOS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
            <option value={LEGADO}>Outros / Legado</option>
          </select>
        </label>
      </div>

      <Secao titulo="Cadastros pendentes" contagem={pendentes.filter(passa).length} abertaInicial>
        {pendentes.filter(passa).length ? (
          <Pendentes usuarios={pendentes.filter(passa)} todos={usuarios} eu={profile} admin={admin} />
        ) : (
          vazio(carregando ? "Carregando…" : filtrando ? "Nenhum cadastro pendente com esse filtro." : "Nenhum cadastro esperando aprovação.")
        )}
      </Secao>

      <h2 className="mt-2 text-base font-bold text-ink-primary dark:text-white">Usuários ativos por cargo</h2>
      {filtrando && blocos.length === 0 && vazio("Nenhum usuário ativo com esse filtro.")}
      {blocos.map((b) => (
        // A chave inclui "tem gente": o bloco abre sozinho quando os dados chegam.
        <Secao key={`${b.id}-${b.lista.length > 0}`} titulo={b.nome} contagem={b.filtrados.length} abertaInicial={b.lista.length > 0} forcarAberto={filtrando}>
          {b.filtrados.length ? tabela(b.filtrados) : vazio("Ninguém neste cargo ainda.")}
        </Secao>
      ))}

      <Secao titulo="Contas pausadas" contagem={pausados.filter(passa).length} descricao="Não entram no portal até serem reativadas. Os dados ficam intactos.">
        {pausados.filter(passa).length ? tabela(pausados.filter(passa)) : vazio("Nenhuma conta pausada.")}
      </Secao>
      <Secao titulo="Contas Excluídas / Recusadas" contagem={excluidos.filter(passa).length} descricao="Ficam bloqueadas, mas dá para restaurar a qualquer momento.">
        {excluidos.filter(passa).length ? tabela(excluidos.filter(passa)) : vazio("Nenhuma conta excluída ou recusada.")}
      </Secao>

      <Secao titulo="Permissões de Edição por Colaborador" descricao="O que cada pessoa pode editar e quais menus enxerga. Cada chave grava na hora.">
        <MatrizPermissoes usuarios={[...ativos, ...pausados].filter(passa)} todos={usuarios} eu={profile} admin={admin} />
      </Secao>
      {enxergaTodos(profile) && (
        <Secao titulo="Editar Permissões do Cargo" descricao="Padrão de acesso e de menus de cada cargo.">
          <PermissoesDoCargo usuarios={usuarios} eu={profile} admin={admin} />
        </Secao>
      )}

      {editando && (
        <ModalEditarUsuario key={editando.uid} usuario={editando} todos={usuarios} eu={profile} admin={admin} onFechar={() => setEditandoId(null)} />
      )}
    </div>
  );
}
