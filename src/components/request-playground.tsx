"use client";

import { Check, ChevronDown, Clock3, Copy, Loader2, Play, RotateCcw } from "lucide-react";
import { FormEvent, useState } from "react";
import type { ApiProduct } from "@/lib/types";
import { cn, getMethodClass } from "@/lib/utils";

const sampleResponse = `{
  "code": 200,
  "message": "ok",
  "requestId": "req_91DSK24D",
  "data": {
    "companyName": "上海星枢科技有限公司",
    "creditCode": "91310115MA1K4X2X7B",
    "status": "ACTIVE",
    "legalRepresentative": "张*",
    "establishedAt": "2021-06-18"
  }
}`;

export function RequestPlayground({ api }: { api: ApiProduct }) {
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [copied, setCopied] = useState(false);
  const [company, setCompany] = useState("上海星枢科技有限公司");

  async function handleRun(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 650));
    setHasRun(true);
    setLoading(false);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(sampleResponse);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid overflow-hidden border border-[var(--line-strong)] bg-[var(--line)] shadow-[var(--shadow-md)] lg:grid-cols-2">
      <form onSubmit={handleRun} className="bg-white">
        <div className="flex h-12 items-center justify-between border-b border-[var(--line)] px-4">
          <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[var(--brand)]" /><strong className="text-[12px]">在线调试</strong></div>
          <span className="rounded-[3px] bg-[var(--brand-soft)] px-2 py-1 text-[9px] font-bold text-[var(--brand-strong)]">沙箱环境</span>
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          <div>
            <label className="mb-2 block text-[11px] font-semibold">请求地址</label>
            <div className="flex h-10 items-center border border-[var(--line)] bg-[var(--canvas)]">
              <span className={cn("mono grid h-full place-items-center px-3 text-[10px] font-bold", getMethodClass(api.method))}>{api.method}</span>
              <span className="mono min-w-0 flex-1 truncate px-3 text-[11px]">https://gateway.starapi.cn{api.endpoint}</span>
              <ChevronDown className="mr-3 size-3.5 text-[var(--muted)]" />
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><label htmlFor="companyName" className="text-[11px] font-semibold">companyName <span className="text-[var(--danger)]">*</span></label><span className="mono text-[9px] text-[var(--muted)]">string · body</span></div>
            <input id="companyName" value={company} onChange={(event) => setCompany(event.target.value)} required className="h-10 w-full border border-[var(--line)] px-3 text-[12px] outline-none focus:border-[var(--brand)]" />
            <p className="mt-1.5 text-[10px] text-[var(--muted)]">企业全称或 18 位统一社会信用代码</p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between"><label htmlFor="fields" className="text-[11px] font-semibold">fields</label><span className="mono text-[9px] text-[var(--muted)]">string[] · body</span></div>
            <input id="fields" defaultValue="basic,risk" className="mono h-10 w-full border border-[var(--line)] px-3 text-[11px] outline-none focus:border-[var(--brand)]" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading || !company} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[4px] bg-[var(--brand)] text-[12px] font-semibold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-3.5 fill-current" />} {loading ? "正在请求" : "发送请求"}
            </button>
            <button type="button" onClick={() => { setCompany(""); setHasRun(false); }} className="grid size-10 place-items-center rounded-[4px] border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-subtle)]" aria-label="重置参数" title="重置参数"><RotateCcw className="size-3.5" /></button>
          </div>
        </div>
      </form>

      <div className="min-h-[430px] bg-[var(--night)] text-white">
        <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-4 text-[11px]"><strong>响应结果</strong>{hasRun && <span className="text-[#69d9b3]">200 OK</span>}</div>
          <button onClick={handleCopy} disabled={!hasRun} className="inline-flex items-center gap-1.5 text-[10px] text-white/55 hover:text-white disabled:opacity-30" aria-label="复制响应">
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "已复制" : "复制"}
          </button>
        </div>
        {hasRun ? (
          <div>
            <div className="flex items-center gap-4 border-b border-white/10 px-4 py-2.5 text-[9px] text-white/45"><span className="inline-flex items-center gap-1"><Clock3 className="size-3" /> 86 ms</span><span>1.24 KB</span><span>TLS 1.3</span></div>
            <pre className="mono overflow-x-auto p-5 text-[11px] leading-6 text-[#c8e8dd]"><code>{sampleResponse}</code></pre>
          </div>
        ) : (
          <div className="grid min-h-[370px] place-items-center px-8 text-center"><div><Play className="mx-auto size-8 text-white/20" /><p className="mt-4 text-[12px] text-white/60">填写参数并发送请求</p><p className="mt-1 text-[10px] text-white/35">响应头、耗时与 JSON 数据将显示在这里</p></div></div>
        )}
      </div>
    </div>
  );
}
