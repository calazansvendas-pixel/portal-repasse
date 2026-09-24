"use client";

import { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { ResumoImportacao } from "@/lib/services/auditEngine";

export function UploadSheet() {
  const { firebaseUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);
  const [colunasNaoEncontradas, setColunasNaoEncontradas] = useState<string[]>([]);

  async function handleFile(file: File) {
    if (!firebaseUser) return;
    setEnviando(true);
    setErro(null);
    setResumo(null);
    setColunasNaoEncontradas([]);
    try {
      const token = await firebaseUser.getIdToken();
      const formData = new FormData();
      formData.append("arquivo", file);

      const res = await fetch("/api/importar-planilha", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) {
        setErro(json.erro ?? "Falha ao importar a planilha.");
        setColunasNaoEncontradas(json.colunasNaoEncontradas ?? []);
        return;
      }

      setResumo(json.resumo as ResumoImportacao);
      setColunasNaoEncontradas(json.colunasNaoEncontradas ?? []);
    } catch {
      setErro("Erro de rede ao enviar a planilha. Tente novamente.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="surface-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-ink-primary dark:text-white">Importar planilha do dia</h2>
          <p className="text-sm text-ink-secondary dark:text-white/60">
            Envie o Excel (aba padrão &quot;0.01 dd-mm&quot;). O sistema salva o snapshot do dia e roda a
            auditoria automática comparando com a importação anterior.
          </p>
        </div>
        <label className="btn-primary shrink-0 cursor-pointer">
          <UploadCloud size={16} />
          {enviando ? "Processando…" : "Selecionar arquivo"}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={enviando}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      </div>

      {erro && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">{erro}</p>
            {colunasNaoEncontradas.length > 0 && (
              <p className="mt-1 text-xs">
                Colunas não localizadas: {colunasNaoEncontradas.join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {resumo && (
        <div className="mt-4 rounded-md border border-status-success/30 bg-status-success/10 p-3 text-sm text-status-success">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <CheckCircle2 size={16} />
            Importação {resumo.importacaoId} concluída
          </div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-ink-primary dark:text-white/80 sm:grid-cols-3">
            <li>Linhas processadas: {resumo.totalLinhas}</li>
            <li>Pastas novas: {resumo.novos}</li>
            <li>Pastas atualizadas: {resumo.atualizados}</li>
            <li>Tarefas criadas: {resumo.tarefasCriadas}</li>
            <li>Tarefas validadas: {resumo.tarefasValidadas}</li>
            <li>Falhas de auditoria: {resumo.falhasAuditoria}</li>
          </ul>
          {resumo.semPraca.length > 0 && (
            <p className="mt-2 text-xs text-status-warning">
              {resumo.semPraca.length} pasta(s) com cidade não mapeada para nenhuma praça: {" "}
              {resumo.semPraca.slice(0, 10).join(", ")}
              {resumo.semPraca.length > 10 ? "…" : ""}
            </p>
          )}
          {colunasNaoEncontradas.length > 0 && (
            <p className="mt-2 text-xs text-status-warning">
              Colunas não localizadas: {colunasNaoEncontradas.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
