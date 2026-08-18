"use client";

import { useState, type ReactNode } from "react";
import { mergeResponseSchema, observedResponseFormats, formatResponseExample, type ObservedResponseContract } from "@/lib/response-contract";
import type { CatalogProduct } from "@/lib/catalog";
import { RequestPlayground } from "@/components/request-playground";

type ResponseContractState = {
  responseParameters: CatalogProduct["responseParameters"];
  responseFormats: string[];
  responseExample: unknown;
  schema: unknown;
  lastContentType: string | null;
};

export function ApiResponseDocumentation({ api, gatewayUrl }: { api: CatalogProduct; gatewayUrl: string }) {
  const [contract, setContract] = useState<ResponseContractState>({
    responseParameters: api.responseParameters,
    responseFormats: api.responseFormats,
    responseExample: api.responseExample,
    schema: api.schema,
    lastContentType: null,
  });

  function observe(observed: ObservedResponseContract) {
    setContract((current) => {
      const currentParameters = new Map(current.responseParameters.map((item) => [item.name, item]));
      const success = observed.statusCode === undefined || (observed.statusCode >= 200 && observed.statusCode < 400);
      return {
        responseParameters: observed.format === "JSON" ? observed.responseParameters.map((item, sortOrder) => ({ ...item, id: currentParameters.get(item.name)?.id ?? `observed-${sortOrder}`, description: currentParameters.get(item.name)?.description || item.description, sortOrder })) : [],
        responseFormats: success ? observedResponseFormats(current.responseFormats, observed.format) : current.responseFormats,
        responseExample: observed.example,
        schema: mergeResponseSchema(current.schema, observed, observed.statusCode ?? 200),
        lastContentType: observed.contentType,
      };
    });
  }

  return <>
    <ContractSection title="返回参数" empty="该接口返回纯文本、媒体或未定义结构化字段。" headers={["名称", "类型", "说明"]}>{contract.responseParameters.map((parameter) => <tr key={parameter.id} className="border-t border-[var(--line)]"><td className="px-3 py-3"><code>{parameter.name}</code></td><td className="px-3 py-3"><code>{parameter.dataType}</code></td><td className="px-3 py-3 leading-5 text-[var(--muted)]">{parameter.description || "-"}</td></tr>)}</ContractSection>
    <section><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">RESPONSE EXAMPLE</p><h2 className="mt-2 text-lg font-bold">返回示例</h2></div><span aria-live="polite" className="text-[9px] text-[var(--muted)]">{contract.responseFormats.join(" / ")}{contract.lastContentType ? ` · 当前 ${contract.lastContentType}` : ""}</span></div><pre className="mono mt-4 max-h-96 overflow-auto rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[10px] leading-5"><code>{formatResponseExample(contract.responseExample)}</code></pre></section>
    <section><p className="eyebrow">SCHEMA</p><h2 className="mt-2 text-lg font-bold">原始 Schema</h2><pre className="mono mt-4 max-h-96 overflow-auto rounded-[7px] border border-[var(--line)] bg-[var(--surface)] p-4 text-[10px] leading-5"><code>{JSON.stringify(contract.schema ?? {}, null, 2)}</code></pre></section>
    <section id="debug" className="scroll-mt-28"><p className="eyebrow">PLAYGROUND</p><h2 className="mt-2 text-lg font-bold">在线请求调试</h2><p className="mt-2 text-[11px] text-[var(--muted)]">请求通过正式公开路由执行，并按订阅规则计量与计费。</p><div className="mt-4"><RequestPlayground api={api} gatewayUrl={gatewayUrl} onResponseContract={observe} /></div></section>
  </>;
}

function ContractSection({ title, empty, headers, children }: { title: string; empty: string; headers: string[]; children: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section><p className="eyebrow">API CONTRACT</p><h2 className="mt-2 text-lg font-bold">{title}</h2><div className="mt-4 overflow-x-auto rounded-[8px] border border-[var(--line)]"><table className="w-full min-w-[640px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr>{headers.map((header) => <th key={header} className="px-3 py-2.5 font-semibold">{header}</th>)}</tr></thead><tbody>{children}{!hasRows && <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-[var(--muted)]">{empty}</td></tr>}</tbody></table></div></section>;
}
