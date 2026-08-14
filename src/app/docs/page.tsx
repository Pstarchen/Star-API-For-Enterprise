import type { Metadata } from "next";
import { Braces, ServerOff, Terminal } from "lucide-react";
import { connection } from "next/server";
import { DocsCopyButton } from "@/components/docs-copy-button";
import { PortalShell } from "@/components/portal-shell";
import { buildPublicApiUrl } from "@/lib/api-routes";
import { buildDocsCurlCommands } from "@/lib/docs-curl";
import { listCatalogProducts } from "@/lib/server/catalog";
import { getPlatformConfig } from "@/lib/server/installation";
import { getMethodClass } from "@/lib/utils";

export const metadata: Metadata = { title: "接入文档" };

export default async function DocsPage() {
  await connection();
  const [products, platform] = await Promise.all([
    listCatalogProducts({ status: "PUBLISHED" }),
    getPlatformConfig(),
  ]);

  return <PortalShell>
    <main className="container-shell py-10 sm:py-14">
      <section className="mx-auto max-w-4xl" aria-labelledby="available-endpoint-title">
        <header className="flex items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[var(--brand-strong)] shadow-[var(--shadow-xs)]">
              <Terminal className="size-4" />
            </span>
            <div className="min-w-0">
              <h1 id="available-endpoint-title" className="text-lg font-bold">当前可用端点请求</h1>
              <p className="mt-1 text-[10px] text-[var(--muted)]">{products.length} 个已发布端点</p>
            </div>
          </div>
        </header>

        {products.length > 0 ? <div className="mt-5 space-y-3">
          {products.map((api, index) => {
            const gatewayUrl = buildPublicApiUrl({
              configuredBaseUrl: process.env.API_PUBLIC_URL,
              platformUrl: platform.publicUrl,
              publicHost: api.publicHost,
              publicPath: api.endpoint,
            });
            const commands = buildDocsCurlCommands({ url: gatewayUrl, methods: api.methods, parameters: api.requestParameters });

            return <article
              key={api.id}
              className="animate-[ui-pop-in_320ms_cubic-bezier(.22,1,.36,1)_both] overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-xs)]"
              style={{ animationDelay: `${Math.min(index * 35, 350)}ms` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-0">
                  <h2 className="truncate text-[12px] font-bold">{api.name}</h2>
                  <code className="mono mt-1 block break-all text-[9px] text-[var(--muted)]">{gatewayUrl}</code>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="rounded-[5px] bg-[var(--surface-subtle)] px-2 py-1 text-[8px] font-semibold text-[var(--muted)]">{api.category}</span>
                  {api.methods.map((method) => <span key={method} className={`rounded-[5px] px-2 py-1 text-[8px] font-bold ${getMethodClass(method)}`}>{method}</span>)}
                </div>
              </div>

              <div className="divide-y divide-white/10 bg-[var(--night)]">
                {commands.map(({ method, command }) => <div key={method} className="relative px-4 py-4 pr-14 sm:px-5 sm:pr-16">
                  {commands.length > 1 && <span className="mb-2 inline-flex items-center gap-1.5 text-[8px] font-bold text-[#9eabc5]"><Braces className="size-3" />{method}</span>}
                  <pre className="mono overflow-x-auto text-[10px] leading-6 text-[#c8e8dd]"><code>{command}</code></pre>
                  <DocsCopyButton command={command} endpointName={api.name} method={method} />
                </div>)}
              </div>
            </article>;
          })}
        </div> : <div className="mt-5 grid min-h-56 place-items-center rounded-[8px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-subtle)] text-center">
          <div>
            <ServerOff className="mx-auto size-5 text-[var(--muted)]" />
            <p className="mt-3 text-[11px] font-semibold">暂无已发布端点</p>
          </div>
        </div>}
      </section>
    </main>
  </PortalShell>;
}
