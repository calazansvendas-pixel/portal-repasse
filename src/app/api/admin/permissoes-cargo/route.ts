import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { enxergaTodos, travaDoCargo } from "@/lib/auth/acoesUsuario";
import { PERMISSOES, calcularPermissoes, ehCargo, permissaoTravada, type PermissoesParciais } from "@/lib/auth/cargos";
import { MENUS, calcularMenus, menuTravado, temMenu, type MenusParciais } from "@/lib/auth/menus";
import {
  DOC_PERMISSOES_CARGO,
  autenticarGestor,
  lerPadroesDosCargos,
  lerUsuarios,
  respostaDeErro,
} from "@/lib/server/usuarios";

export const runtime = "nodejs";

/** "Editar permissões do cargo": grava o padrão e recalcula o efetivo de quem tem o cargo. */
export async function PUT(req: NextRequest) {
  try {
    const auth = await autenticarGestor(req);
    if (auth instanceof NextResponse) return auth;
    if (!enxergaTodos(auth.perfil)) {
      return NextResponse.json({ erro: "Só Dono, Administrador ou Gerência alteram o padrão de um cargo." }, { status: 403 });
    }

    const corpo = (await req.json().catch(() => null)) as {
      cargo?: unknown;
      permissoes?: Record<string, unknown>;
      /** Só os menus que a pessoa mexeu: os demais continuam acompanhando as permissões. */
      menus?: Record<string, unknown>;
    } | null;
    const cargo = corpo?.cargo;
    if (!ehCargo(cargo)) return NextResponse.json({ erro: "Cargo inválido." }, { status: 400 });
    if (cargo === "dono") return NextResponse.json({ erro: "O Dono tem sempre todas as permissões." }, { status: 400 });
    const trava = travaDoCargo(auth.perfil, cargo);
    if (trava) return NextResponse.json({ erro: trava }, { status: 403 });

    const permissoes: PermissoesParciais = {};
    for (const { id } of PERMISSOES) permissoes[id] = permissaoTravada(cargo, id) || corpo?.permissoes?.[id] === true;

    const [todos, padroes] = await Promise.all([lerUsuarios(), lerPadroesDosCargos()]);
    const menusDoCargo: MenusParciais = { ...padroes.menus[cargo] };
    for (const { id, nome } of MENUS) {
      const valor = corpo?.menus?.[id];
      if (typeof valor !== "boolean") continue;
      if (valor && !menusDoCargo[id] && !temMenu(auth.perfil, id)) {
        return NextResponse.json({ erro: `Você não pode liberar o menu "${nome}" porque não tem acesso a ele.` }, { status: 403 });
      }
      menusDoCargo[id] = menuTravado(cargo, id) || valor;
    }
    const novas = { ...padroes.permissoes, [cargo]: permissoes };
    const novosMenus = { ...padroes.menus, [cargo]: menusDoCargo };
    const db = getAdminDb();
    const lote = db.batch();
    const agora = new Date().toISOString();
    lote.set(db.doc(DOC_PERMISSOES_CARGO), { cargos: novas, menus: novosMenus, atualizadoPor: auth.uid, atualizadoEm: agora }, { merge: true });
    for (const u of todos.filter((u) => u.cargo === cargo)) {
      lote.update(db.collection("users").doc(u.uid), {
        permissoesEfetivas: calcularPermissoes(u, novas),
        menusEfetivos: calcularMenus(u, novas, novosMenus),
        atualizadoEm: agora,
      });
    }
    await lote.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respostaDeErro("admin/permissoes-cargo", error);
  }
}
