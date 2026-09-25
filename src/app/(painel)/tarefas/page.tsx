import { redirect } from "next/navigation";

// Os quadros de tarefas agora vivem direto no Painel.
export default function TarefasPage() {
  redirect("/dashboard");
}
