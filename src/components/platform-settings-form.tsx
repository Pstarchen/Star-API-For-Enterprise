"use client";

import { CheckCircle2, ImageIcon, Loader2, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { ChangeEvent, FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { platformIconUrl, type PlatformConfig } from "@/lib/platform";

type IconAction = "keep" | "replace" | "remove";

export function PlatformSettingsForm({ config }: { config: PlatformConfig }) {
  const router = useRouter();
  const uploadId = useId();
  const [iconAction, setIconAction] = useState<IconAction>("keep");
  const [iconDataUrl, setIconDataUrl] = useState("");
  const [preview, setPreview] = useState(config.hasCustomIcon ? platformIconUrl(config) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function selectIcon(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const acceptedTypes = ["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"];
    if (!acceptedTypes.includes(file.type) || file.size > 512 * 1024) {
      setError("请选择 512 KB 内的 PNG、JPEG、WebP 或 ICO 图标");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setIconDataUrl(reader.result);
      setPreview(reader.result);
      setIconAction("replace");
      setSaved(false);
      setError("");
    };
    reader.onerror = () => setError("无法读取网站图标");
    reader.readAsDataURL(file);
  }

  function removeIcon() {
    setIconAction("remove");
    setIconDataUrl("");
    setPreview("");
    setSaved(false);
  }

  function restoreIcon() {
    setIconAction("keep");
    setIconDataUrl("");
    setPreview(config.hasCustomIcon ? platformIconUrl(config) : "");
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          publicUrl: form.get("publicUrl"),
          iconAction,
          iconDataUrl: iconAction === "replace" ? iconDataUrl : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? "平台配置保存失败");
        return;
      }

      const nextConfig = result.data as PlatformConfig;
      setIconAction("keep");
      setIconDataUrl("");
      setPreview(nextConfig.hasCustomIcon ? platformIconUrl(nextConfig) : "");
      setSaved(true);
      router.refresh();
    } catch {
      setError("无法连接配置服务，请检查服务状态");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "h-10 w-full border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] outline-none focus:border-[var(--brand)]";
  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="eyebrow">PLATFORM IDENTITY</p>
        <h2 className="mt-1 text-xl font-bold">平台品牌设置</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">统一配置 API 开放分发平台在门户、控制台和浏览器中的公开身份。</p>
      </div>

      <section className="panel">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h3 className="text-[13px] font-bold">网站信息</h3>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[10px] font-semibold">网站名称</span>
            <input name="name" required minLength={2} maxLength={40} defaultValue={config.name} className={inputClass} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[10px] font-semibold">网站介绍</span>
            <textarea name="description" required minLength={10} maxLength={500} rows={4} defaultValue={config.description} className="w-full resize-y border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[11px] leading-5 outline-none focus:border-[var(--brand)]" />
            <small className="mt-1.5 block text-[9px] text-[var(--muted)]">用于首页品牌文案、浏览器描述和搜索引擎摘要。</small>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[10px] font-semibold">公开访问地址</span>
            <input name="publicUrl" required type="url" defaultValue={config.publicUrl} placeholder="https://example.com" className={inputClass} />
            <small className="mt-1.5 block text-[9px] text-[var(--muted)]">填写用户实际访问的平台根地址，生产环境建议使用 HTTPS。</small>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <h3 className="text-[13px] font-bold">网站图标</h3>
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[6px] border border-[var(--line)] bg-[var(--surface-subtle)] text-[var(--muted)]">
            {preview ? <Image src={preview} alt="网站图标预览" width={80} height={80} unoptimized className="size-full object-cover" /> : <ImageIcon className="size-7" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold">门户 Logo 与浏览器图标</p>
            <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">支持 PNG、JPEG、WebP 或 ICO，最大 512 KB；建议使用正方形图片。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label htmlFor={uploadId} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[4px] bg-[var(--brand)] px-3 text-[10px] font-semibold text-white hover:bg-[var(--brand-strong)]">
                <Upload className="size-3.5" />上传图标
              </label>
              <input id={uploadId} type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon" onChange={selectIcon} className="sr-only" />
              {preview && <button type="button" onClick={removeIcon} className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-[var(--line)] px-3 text-[10px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]"><Trash2 className="size-3.5" />移除</button>}
              {iconAction !== "keep" && <button type="button" onClick={restoreIcon} className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-[var(--line)] px-3 text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-subtle)]"><RotateCcw className="size-3.5" />撤销</button>}
            </div>
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-[4px] bg-[var(--danger-soft)] px-3 py-2.5 text-[10px] text-[var(--danger)]">{error}</p>}
      <div className="flex items-center justify-end gap-3">
        {saved && <span role="status" className="inline-flex items-center gap-1.5 text-[10px] text-[var(--success)]"><CheckCircle2 className="size-3.5" />配置已生效</span>}
        <button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-[4px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-60">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{saving ? "正在保存" : "保存更改"}
        </button>
      </div>
    </form>
  );
}
