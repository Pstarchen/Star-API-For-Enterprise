import { ServerCog } from "lucide-react";
import { connection } from "next/server";
import { PlatformSettingsForm } from "@/components/platform-settings-form";
import { SystemUpdatePanel } from "@/components/system-update-panel";
import { getPlatformConfig } from "@/lib/server/installation";
import { getSystemUpdateStatus } from "@/lib/server/system-update";

export default async function AdminSettingsPage() {
  await connection();
  const [config, updateStatus] = await Promise.all([getPlatformConfig(), getSystemUpdateStatus()]);
  return <div className="pb-10">
    <PlatformSettingsForm config={config} />
    <section className="mx-auto mt-10 max-w-5xl space-y-4 border-t border-[var(--line)] pt-8" aria-labelledby="system-maintenance-title">
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)] text-[var(--brand)]"><ServerCog className="size-4" /></span>
        <div><p className="eyebrow">SYSTEM MAINTENANCE</p><h2 id="system-maintenance-title" className="mt-1 text-xl font-bold">系统安装与更新</h2><p className="mt-1 text-[11px] text-[var(--muted)]">品牌配置保存完成后，可在此检查运行版本或提交宿主机更新。</p></div>
      </header>
      <SystemUpdatePanel initialStatus={updateStatus} />
    </section>
  </div>;
}
