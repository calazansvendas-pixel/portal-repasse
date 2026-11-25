import { redirect } from "next/navigation";

// Apelido de "/motor-regras": o guard do painel aplica a permissão no destino.
export default function RegrasPage() {
  redirect("/motor-regras");
}
