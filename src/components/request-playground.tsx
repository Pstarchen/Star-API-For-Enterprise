"use client";

import { Check, Clock3, Copy, KeyRound, Loader2, Play, RotateCcw } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { CatalogProduct } from "@/lib/catalog";

export function RequestPlayground({ api, gatewayUrl }: { api: CatalogProduct; gatewayUrl: string }) {
  const [key, setKey] = useState("");
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ status: number; statusText: string; text: string; latency: number; requestId: string | null; cost: string | null } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function run(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(""); setResponse(null);
    let requestBody: string | undefined;
    if (!["GET", "HEAD"].includes(api.method)) {
      try { requestBody = JSON.stringify(JSON.parse(body)); }
      catch { setError("请求体不是有效 JSON"); setLoading(false); return; }
    }
    const started = performance.now();
    try {
      const suffix = query.trim() ? (query.trim().startsWith("?") ? query.trim() : `?${query.trim()}`) : "";
      const result = await fetch(`${gatewayUrl}${suffix}`, { method: api.method, headers: { Authorization: `Bearer ${key.trim()}`, ...(requestBody ? { "Content-Type": "application/json" } : {}) }, body: requestBody, cache: "no-store" });
      const text = await result.text();
      let formatted = text;
      try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Upstream may return non-JSON. */ }
      setResponse({ status: result.status, statusText: result.statusText, text: formatted, latency: Math.round(performance.now() - started), requestId: result.headers.get("x-star-request-id"), cost: result.headers.get("x-request-cost") });
    } catch { setError("请求未能到达网关"); }
    finally { setLoading(false); }
  }

  async function copy() { if (!response) return; await navigator.clipboard.writeText(response.text); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }

  return <div className="grid overflow-hidden rounded-[8px] border border-[var(--line-strong)] bg-[var(--line)] shadow-[var(--shadow-md)] lg:grid-cols-2"><form onSubmit={run} className="bg-[var(--surface)]"><div className="flex h-12 items-center justify-between border-b border-[var(--line)] px-4"><strong className="text-[12px]">真实网关请求</strong><span className="rounded-[4px] bg-[var(--warning-soft)] px-2 py-1 text-[9px] font-semibold text-[var(--warning)]">计量与计费生效</span></div><div className="space-y-4 p-4 sm:p-5"><label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold"><KeyRound className="size-3.5" />API Key</span><input value={key} onChange={(event) => setKey(event.target.value)} required type="password" autoComplete="off" placeholder="sk_test_... 或 sk_live_..." className="h-10 w-full rounded-[6px] border border-[var(--line)] px-3 text-[11px] outline-none focus:border-[var(--brand)]" /></label><label className="block"><span className="mb-1.5 block text-[10px] font-semibold">查询参数</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="name=value&limit=10" className="mono h-10 w-full rounded-[6px] border border-[var(--line)] px-3 text-[10px] outline-none focus:border-[var(--brand)]" /></label>{!["GET", "HEAD"].includes(api.method) && <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">JSON 请求体</span><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={9} spellCheck={false} className="mono w-full rounded-[6px] border border-[var(--line)] bg-[var(--canvas)] p-3 text-[10px] leading-5 outline-none focus:border-[var(--brand)]" /></label>}{error && <p role="alert" className="rounded-[6px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}<div className="flex gap-2"><button disabled={loading || !key.trim()} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[6px] bg-[var(--brand)] text-[11px] font-semibold text-white disabled:opacity-50">{loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-3.5 fill-current" />}{loading ? "正在调用" : "发送真实请求"}</button><button type="button" onClick={() => { setQuery(""); setBody("{}"); setResponse(null); setError(""); }} className="grid size-10 place-items-center rounded-[6px] border border-[var(--line)]" title="重置"><RotateCcw className="size-3.5" /></button></div></div></form><div className="min-h-[430px] bg-[var(--night)] text-white"><div className="flex h-12 items-center justify-between border-b border-white/10 px-4"><strong className="text-[11px]">响应结果</strong><button onClick={copy} disabled={!response} className="inline-flex items-center gap-1.5 text-[10px] text-white/55 disabled:opacity-30">{copied ? <Check className="size-3" /> : <Copy className="size-3" />}{copied ? "已复制" : "复制"}</button></div>{response ? <><div className="flex flex-wrap gap-4 border-b border-white/10 px-4 py-2.5 text-[9px] text-white/55"><span className={response.status < 400 ? "text-[#69d9b3]" : "text-[#ffbd8a]"}>{response.status} {response.statusText}</span><span className="flex items-center gap-1"><Clock3 className="size-3" />{response.latency} ms</span>{response.requestId && <span>{response.requestId}</span>}{response.cost && <span>费用 ¥{response.cost}</span>}</div><pre className="mono max-h-[520px] overflow-auto p-5 text-[10px] leading-6 text-[#c8e8dd]"><code>{response.text || "(空响应)"}</code></pre></> : <div className="grid min-h-[370px] place-items-center text-center"><div><Play className="mx-auto size-8 text-white/20" /><p className="mt-3 text-[11px] text-white/55">尚未发起请求</p></div></div>}</div></div>;
}
