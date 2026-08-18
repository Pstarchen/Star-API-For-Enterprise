"use client";

import Image from "next/image";
import { Check, Clock3, Copy, Download, FileDown, KeyRound, Loader2, Play, RotateCcw, Square } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { CatalogProduct } from "@/lib/catalog";
import { inferResponseContract, type ObservedResponseContract } from "@/lib/response-contract";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const requestTimeoutMs = 30_000;

type ResponseMetadata = {
  status: number;
  statusText: string;
  latency: number;
  requestId: string | null;
  cost: string | null;
  contentType: string;
  size: number;
  filename: string;
};

type PlaygroundResponse = ResponseMetadata & (
  | { kind: "text"; text: string }
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | { kind: "binary"; url: string }
);

function sniffImageType(bytes: Uint8Array, declaredType: string) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/)) return "image/gif";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(4, 12)).match(/^ftyp(?:avif|avis)$/)) return "image/avif";
  return declaredType.startsWith("image/") ? declaredType : null;
}

function isTextResponse(contentType: string) {
  return !contentType
    || contentType.startsWith("text/")
    || contentType.includes("json")
    || contentType.includes("xml")
    || contentType.includes("javascript")
    || contentType.includes("x-www-form-urlencoded");
}

function decodeText(bytes: Uint8Array, contentType: string) {
  const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
  try { return new TextDecoder(charset).decode(bytes); }
  catch { return new TextDecoder().decode(bytes); }
}

function extensionFor(contentType: string) {
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-matroska": "mkv",
    "video/x-msvideo": "avi",
    "application/json": "json",
    "text/plain": "txt",
  };
  return extensions[contentType] ?? "bin";
}

function responseFilename(headers: Headers, contentType: string) {
  const disposition = headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const basic = disposition.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1];
  let filename = encoded ?? basic ?? "";
  if (encoded) {
    try { filename = decodeURIComponent(encoded); } catch { /* Keep the upstream value. */ }
  }
  filename = filename.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim() ?? "";
  return filename || `api-response.${extensionFor(contentType)}`;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function parameterValue(value: string, dataType: string): unknown {
  if (dataType === "integer") return Number.parseInt(value, 10);
  if (dataType === "number") return Number(value);
  if (dataType === "boolean") return ["true", "1"].includes(value.toLowerCase());
  if (dataType === "array" || dataType === "object") return JSON.parse(value);
  return value;
}

export function RequestPlayground({ api, gatewayUrl, onResponseContract }: { api: CatalogProduct; gatewayUrl: string; onResponseContract?: (contract: ObservedResponseContract) => void }) {
  const keyRef = useRef<HTMLInputElement>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("{}");
  const callableMethods = api.methods.includes("ALL") ? ["GET", "POST", "PUT", "PATCH", "DELETE"] : api.methods;
  const [method, setMethod] = useState(callableMethods[0] ?? "GET");
  const [parameterValues, setParameterValues] = useState<Record<string, string>>(() => Object.fromEntries(api.requestParameters.map((parameter) => [parameter.id, parameter.defaultValue ?? ""])));
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  useEffect(() => {
    return () => {
      if (response?.kind === "image" || response?.kind === "video" || response?.kind === "binary") URL.revokeObjectURL(response.url);
    };
  }, [response]);

  async function run(event: FormEvent) {
    event.preventDefault();
    const apiKey = keyRef.current?.value.trim() ?? "";
    if (!apiKey) { setError("请输入 API Key"); return; }

    setLoading(true); setError(""); setResponse(null);
    let requestBody: string | undefined;
    if (!["GET", "HEAD"].includes(method)) {
      try {
        const rawBody = JSON.parse(body) as unknown;
        const bodyObject = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody as Record<string, unknown> : {};
        for (const parameter of api.requestParameters.filter((item) => item.location === "BODY")) {
          const value = parameterValues[parameter.id] ?? "";
          if (value) bodyObject[parameter.name] = parameterValue(value, parameter.dataType);
        }
        requestBody = JSON.stringify(bodyObject);
      }
      catch { setError("请求体不是有效 JSON"); setLoading(false); return; }
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, api.internalHandler === "content.random-video" ? 5 * 60_000 : requestTimeoutMs);
    const started = performance.now();

    try {
      const queryParams = new URLSearchParams(query.trim().replace(/^\?/, ""));
      for (const parameter of api.requestParameters.filter((item) => item.location === "QUERY")) {
        const value = parameterValues[parameter.id] ?? "";
        if (value) queryParams.set(parameter.name, value);
      }
      let requestUrl = gatewayUrl;
      for (const parameter of api.requestParameters.filter((item) => item.location === "PATH")) {
        const value = parameterValues[parameter.id] ?? "";
        requestUrl = requestUrl.replace(`{${parameter.name}}`, encodeURIComponent(value));
      }
      const suffix = queryParams.size ? `?${queryParams}` : "";
      const result = await fetch(`${requestUrl}${suffix}`, {
        method,
        headers: {
          Accept: "application/json, text/plain, image/*, video/*, */*",
          Authorization: `Bearer ${apiKey}`,
          ...(requestBody ? { "Content-Type": "application/json" } : {}),
        },
        body: requestBody,
        cache: "no-store",
        signal: controller.signal,
      });
      const buffer = await result.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const declaredType = (result.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
      const imageType = sniffImageType(bytes, declaredType);
      const contentType = imageType ?? (declaredType || "application/octet-stream");
      const metadata: ResponseMetadata = {
        status: result.status,
        statusText: result.statusText,
        latency: Math.round(performance.now() - started),
        requestId: result.headers.get("x-star-request-id"),
        cost: result.headers.get("x-request-cost"),
        contentType,
        size: buffer.byteLength,
        filename: responseFilename(result.headers, contentType),
      };

      if (imageType) {
        const url = URL.createObjectURL(new Blob([buffer], { type: imageType }));
        setResponse({ ...metadata, kind: "image", url });
        onResponseContract?.(inferResponseContract({ body: "", contentType: imageType, statusCode: result.status }));
      } else if (declaredType.startsWith("video/")) {
        const url = URL.createObjectURL(new Blob([buffer], { type: declaredType }));
        setResponse({ ...metadata, kind: "video", url });
        onResponseContract?.(inferResponseContract({ body: "", contentType: declaredType, statusCode: result.status }));
      } else if (isTextResponse(declaredType)) {
        const text = decodeText(bytes, result.headers.get("content-type") ?? "");
        let formatted = text;
        try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { /* Upstream may return non-JSON text. */ }
        setResponse({ ...metadata, kind: "text", text: formatted });
        onResponseContract?.(inferResponseContract({ body: text, contentType: result.headers.get("content-type"), statusCode: result.status }));
      } else {
        const candidateText = decodeText(bytes, result.headers.get("content-type") ?? "");
        const candidate = inferResponseContract({ body: candidateText, contentType, statusCode: result.status });
        if (candidate.format !== "BINARY") {
          let formatted = candidateText;
          try { formatted = JSON.stringify(JSON.parse(candidateText), null, 2); } catch { /* Keep a non-JSON text payload readable. */ }
          setResponse({ ...metadata, kind: "text", text: formatted });
          onResponseContract?.(candidate);
        } else {
          const url = URL.createObjectURL(new Blob([buffer], { type: contentType }));
          setResponse({ ...metadata, kind: "binary", url });
          onResponseContract?.(candidate);
        }
      }
    } catch (requestError) {
      if (controller.signal.aborted) setError(timedOut ? "请求超过 30 秒，已自动终止" : "请求已取消");
      else setError(requestError instanceof Error ? `请求未能到达网关：${requestError.message}` : "请求未能到达网关");
    } finally {
      window.clearTimeout(timeout);
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      setLoading(false);
    }
  }

  async function copy() {
    if (!response || response.kind !== "text") return;
    await navigator.clipboard.writeText(response.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function reset() {
    requestControllerRef.current?.abort();
    setQuery(""); setBody("{}"); setParameterValues(Object.fromEntries(api.requestParameters.map((parameter) => [parameter.id, parameter.defaultValue ?? ""]))); setResponse(null); setError("");
  }

  return <div className="grid overflow-hidden rounded-[8px] border border-[var(--line-strong)] bg-[var(--line)] shadow-[var(--shadow-md)] lg:grid-cols-2">
    <form onSubmit={run} className="bg-[var(--surface)]">
      <div className="flex h-12 items-center justify-between border-b border-[var(--line)] px-4"><strong className="text-[12px]">真实网关请求</strong><span className="rounded-[4px] bg-[var(--warning-soft)] px-2 py-1 text-[9px] font-semibold text-[var(--warning)]">计量与计费生效</span></div>
      <div className="space-y-4 p-4 sm:p-5">
        <label className="block" htmlFor="playground-api-key"><span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold"><KeyRound className="size-3.5" />API Key</span><input ref={keyRef} id="playground-api-key" name="apiKey" onInput={(event) => setHasKey(Boolean(event.currentTarget.value.trim()))} required type="password" autoComplete="new-password" spellCheck={false} placeholder="sk_test_... 或 sk_live_..." className="mono h-10 w-full rounded-[6px] border border-[var(--line)] px-3 text-[11px] outline-none focus:border-[var(--brand)]" /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">请求方法</span><Select value={method} onValueChange={setMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{callableMethods.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></label>
        {api.requestParameters.map((parameter) => <label key={parameter.id} className="block"><span className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold"><span>{parameter.name}{parameter.required && <em className="ml-1 not-italic text-[var(--danger)]">必填</em>}</span><small className="font-normal text-[var(--muted)]">{parameter.location} · {parameter.dataType}</small></span><input value={parameterValues[parameter.id] ?? ""} onChange={(event) => setParameterValues((values) => ({ ...values, [parameter.id]: event.target.value }))} required={parameter.required} placeholder={parameter.defaultValue ?? parameter.description} className="mono h-10 w-full rounded-[6px] border border-[var(--line)] px-3 text-[10px] outline-none focus:border-[var(--brand)]" />{parameter.description && <small className="mt-1 block text-[8px] leading-4 text-[var(--muted)]">{parameter.description}</small>}</label>)}
        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">附加查询参数</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="extra=value" className="mono h-10 w-full rounded-[6px] border border-[var(--line)] px-3 text-[10px] outline-none focus:border-[var(--brand)]" /></label>
        {!["GET", "HEAD"].includes(method) && <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">附加 JSON 请求体</span><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} spellCheck={false} className="mono w-full rounded-[6px] border border-[var(--line)] bg-[var(--canvas)] p-3 text-[10px] leading-5 outline-none focus:border-[var(--brand)]" /></label>}
        {error && <p role="alert" className="rounded-[6px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}
        <div className="flex gap-2"><button disabled={loading || !hasKey} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[6px] bg-[var(--brand)] text-[11px] font-semibold text-white disabled:opacity-50">{loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-3.5 fill-current" />}{loading ? "正在调用" : "发送真实请求"}</button><button type="button" onClick={loading ? () => requestControllerRef.current?.abort() : reset} className="grid size-10 place-items-center rounded-[6px] border border-[var(--line)]" title={loading ? "取消请求" : "重置"}>{loading ? <Square className="size-3.5 fill-current" /> : <RotateCcw className="size-3.5" />}</button></div>
      </div>
    </form>
    <div className="min-h-[430px] bg-[var(--night)] text-white">
      <div className="flex h-12 items-center justify-between border-b border-white/10 px-4"><strong className="text-[11px]">响应结果</strong>{response?.kind === "text" ? <button onClick={copy} className="inline-flex items-center gap-1.5 text-[10px] text-white/55">{copied ? <Check className="size-3" /> : <Copy className="size-3" />}{copied ? "已复制" : "复制"}</button> : response ? <a href={response.url} download={response.filename} className="inline-flex items-center gap-1.5 text-[10px] text-white/55"><Download className="size-3" />下载</a> : <span className="inline-flex items-center gap-1.5 text-[10px] text-white/30"><Copy className="size-3" />复制</span>}</div>
      {response ? <><div className="flex flex-wrap gap-4 border-b border-white/10 px-4 py-2.5 text-[9px] text-white/55"><span className={response.status < 400 ? "text-[#69d9b3]" : "text-[#ffbd8a]"}>{response.status} {response.statusText}</span><span className="flex items-center gap-1"><Clock3 className="size-3" />{response.latency} ms</span><span>{response.contentType}</span><span>{formatBytes(response.size)}</span>{response.requestId && <span>{response.requestId}</span>}{response.cost && <span>费用 ¥{response.cost}</span>}</div><ResponseBody response={response} /></> : <div className="grid min-h-[370px] place-items-center text-center"><div><Play className="mx-auto size-8 text-white/20" /><p className="mt-3 text-[11px] text-white/55">尚未发起请求</p></div></div>}
    </div>
  </div>;
}

function ResponseBody({ response }: { response: PlaygroundResponse }) {
  if (response.kind === "text") return <pre data-testid="playground-text-response" className="mono max-h-[520px] overflow-auto p-5 text-[10px] leading-6 text-[#c8e8dd]"><code>{response.text || "(空响应)"}</code></pre>;
  if (response.kind === "image") return <div data-testid="playground-image-response" className="p-4"><div className="relative min-h-[340px] overflow-hidden rounded-[7px] border border-white/10 bg-[linear-gradient(45deg,#1b1d29_25%,transparent_25%),linear-gradient(-45deg,#1b1d29_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1b1d29_75%),linear-gradient(-45deg,transparent_75%,#1b1d29_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"><Image src={response.url} alt="API 返回的图片" fill unoptimized sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain" /></div></div>;
  if (response.kind === "video") return <div data-testid="playground-video-response" className="p-4"><video src={response.url} controls playsInline preload="metadata" className="max-h-[480px] w-full rounded-[7px] bg-black" /></div>;
  return <div data-testid="playground-binary-response" className="grid min-h-[370px] place-items-center p-5 text-center"><div><FileDown className="mx-auto size-8 text-white/25" /><p className="mt-3 text-[11px] text-white/65">已识别为二进制响应</p><p className="mt-1 text-[9px] text-white/40">{response.filename} · {formatBytes(response.size)}</p><a href={response.url} download={response.filename} className="mt-4 inline-flex h-9 items-center gap-2 rounded-[6px] bg-white/10 px-4 text-[10px] font-semibold hover:bg-white/15"><Download className="size-3.5" />下载文件</a></div></div>;
}
