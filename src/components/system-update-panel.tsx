"use client";

import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Rocket, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

type UpdateStatus = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  updateEnabled: boolean;
  updateProvider: "github-actions" | "disabled";
  lastRun: { id: number; status: string; conclusion: string | null; htmlUrl: string; createdAt: string; updatedAt: string } | null;
};

export function SystemUpdatePanel({ initialStatus }: { initialStatus: UpdateStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/admin/system-update", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "检查更新失败"); return; }
      setStatus(result.data);
      setMessage("已刷新更新状态");
    } catch {
      setError("无法连接系统更新服务");
    } finally {
      setLoading(false);
    }
  }

  async function update() {
    if (!status.latestVersion) return;
    setUpdating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/admin/system-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: status.latestVersion }) });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "提交更新失败"); return; }
      setStatus(result.data);
      setMessage(result.message);
    } catch {
      setError("无法连接系统更新服务");
    } finally {
      setUpdating(false);
    }
  }

  const runTone = status.lastRun?.status === "completed" && status.lastRun.conclusion === "success" ? "success" : status.lastRun?.status === "completed" && status.lastRun.conclusion ? "danger" : "warning";

  return <section className="panel overflow-hidden">
    <header className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="text-[13px] font-bold">系统安装与更新</h3><p className="mt-1 text-[9px] text-[var(--muted)]">检查 GHCR 最新稳定版本，并通过生产部署工作流完成备份、迁移和健康验证。</p></div>
      <Badge variant={status.updateEnabled ? "success" : "warning"}>{status.updateEnabled ? "已启用平台内更新" : "未启用一键更新"}</Badge>
    </header>
    <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="当前版本" value={status.currentVersion} />
        <Metric label="最新版本" value={status.latestVersion ?? "检查失败"} />
        <Metric label="状态" value={status.updateAvailable ? "可更新" : "已是最新"} tone={status.updateAvailable ? "text-[var(--warning)]" : "text-[var(--success)]"} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
        <Button type="button" variant="secondary" onClick={refresh} disabled={loading || updating}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}检查最新版</Button>
        <Button type="button" onClick={update} disabled={!status.updateEnabled || !status.updateAvailable || !status.latestVersion || loading || updating}>{updating ? <Loader2 className="animate-spin" /> : <Rocket />}拉取并更新</Button>
      </div>
    </div>
    {!status.updateEnabled && <div className="mx-5 mb-5 flex gap-2 rounded-[8px] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-3 text-[9px] leading-5 text-[var(--warning)]"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" /><span>如需在平台内一键更新，请在生产环境为 app 服务配置只具备 Actions workflow dispatch 权限的 `STAR_API_GITHUB_TOKEN_FILE`，然后重启应用。</span></div>}
    {status.lastRun && <div className="mx-5 mb-5 flex flex-col gap-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)] p-3 text-[10px] sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2"><Badge variant={runTone}>{status.lastRun.status}{status.lastRun.conclusion ? ` / ${status.lastRun.conclusion}` : ""}</Badge><span className="text-[var(--muted)]">最近部署更新于 {new Date(status.lastRun.updatedAt).toLocaleString("zh-CN")}</span></span>
      <a href={status.lastRun.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-[var(--brand-strong)]">查看工作流<ExternalLink className="size-3.5" /></a>
    </div>}
    {(message || error) && <p role={error ? "alert" : "status"} className={`mx-5 mb-5 flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-[10px] ${error ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--success-soft)] text-[var(--success)]"}`}>{!error && <CheckCircle2 className="size-3.5" />}{error || message}</p>}
  </section>;
}

function Metric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)] p-3"><span className="block text-[9px] font-semibold text-[var(--muted)]">{label}</span><strong className={`mt-2 block text-lg ${tone}`}>{value}</strong></div>;
}
