import { Terminal } from "lucide-react";
import { PortalShell } from "@/components/portal-shell";

const curl = `curl --request GET 'https://api.starchen.top/api/ipqm' \\
  --header 'Authorization: Bearer $STAR_API_KEY'`;

export default function DocsPage() {
  return <PortalShell>
    <main className="container-shell py-10 sm:py-14">
      <section className="mx-auto max-w-3xl" aria-labelledby="available-endpoint-title">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-[var(--brand)]" />
          <h1 id="available-endpoint-title" className="text-lg font-bold">当前可用端点请求</h1>
        </div>
        <p className="mt-3 text-[11px] text-[var(--muted)]">端点：获取本机IP签名档</p>
        <pre className="mono mt-4 overflow-x-auto rounded-[7px] bg-[var(--night)] p-5 text-[10px] leading-6 text-[#c8e8dd]"><code>{curl}</code></pre>
      </section>
    </main>
  </PortalShell>;
}
