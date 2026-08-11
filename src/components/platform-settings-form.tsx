"use client";

import { CheckCircle2, ImageIcon, Loader2, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { platformHeroUrl, platformIconUrl, type PlatformConfig } from "@/lib/platform";
import { Button } from "./ui/button";
import { FileUploadField } from "./ui/file-upload";
import { Input } from "./ui/input";

type AssetAction = "keep" | "replace" | "remove";

export function PlatformSettingsForm({ config }: { config: PlatformConfig }) {
  const router = useRouter();
  const [iconAction, setIconAction] = useState<AssetAction>("keep");
  const [heroAction, setHeroAction] = useState<AssetAction>("keep");
  const [iconDataUrl, setIconDataUrl] = useState("");
  const [heroDataUrl, setHeroDataUrl] = useState("");
  const [iconPreview, setIconPreview] = useState(config.hasCustomIcon ? platformIconUrl(config) : "");
  const [heroPreview, setHeroPreview] = useState(platformHeroUrl(config));
  const [iconReset, setIconReset] = useState(0);
  const [heroReset, setHeroReset] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function selectAsset(files: File[], kind: "icon" | "hero") {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      if (kind === "icon") { setIconDataUrl(reader.result); setIconPreview(reader.result); setIconAction("replace"); }
      else { setHeroDataUrl(reader.result); setHeroPreview(reader.result); setHeroAction("replace"); }
      setSaved(false);
      setError("");
    };
    reader.onerror = () => setError("无法读取所选图片");
    reader.readAsDataURL(file);
  }

  function resetIcon(remove: boolean) {
    setIconAction(remove ? "remove" : "keep");
    setIconDataUrl("");
    setIconPreview(remove ? "" : config.hasCustomIcon ? platformIconUrl(config) : "");
    setIconReset((value) => value + 1);
    setSaved(false);
  }

  function resetHero(remove: boolean) {
    setHeroAction(remove ? "remove" : "keep");
    setHeroDataUrl("");
    setHeroPreview(remove ? "/art/anime-operator.jpg" : platformHeroUrl(config));
    setHeroReset((value) => value + 1);
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), description: form.get("description"), publicUrl: form.get("publicUrl"), icpNumber: form.get("icpNumber"), publicSecurityNumber: form.get("publicSecurityNumber"), iconAction, iconDataUrl: iconAction === "replace" ? iconDataUrl : undefined, heroAction, heroDataUrl: heroAction === "replace" ? heroDataUrl : undefined }) });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "平台配置保存失败"); return; }
      const next = result.data as PlatformConfig;
      setIconAction("keep");
      setHeroAction("keep");
      setIconDataUrl("");
      setHeroDataUrl("");
      setIconPreview(next.hasCustomIcon ? platformIconUrl(next) : "");
      setHeroPreview(platformHeroUrl(next));
      setIconReset((value) => value + 1);
      setHeroReset((value) => value + 1);
      setSaved(true);
      router.refresh();
    } catch { setError("无法连接配置服务，请检查服务状态"); }
    finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="mx-auto max-w-5xl space-y-5">
    <div><p className="eyebrow">PLATFORM IDENTITY</p><h2 className="mt-1 text-xl font-bold">平台品牌设置</h2><p className="mt-1 text-[11px] text-[var(--muted)]">统一配置门户文案、首屏视觉、站点图标和合规备案信息。</p></div>

    <section className="panel overflow-hidden"><header className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">网站信息</h3></header><div className="grid gap-4 p-5 sm:grid-cols-2">
      <Field label="网站名称"><Input name="name" required minLength={2} maxLength={40} defaultValue={config.name} /></Field>
      <Field label="公开访问地址"><Input name="publicUrl" required type="url" defaultValue={config.publicUrl} placeholder="https://example.com" /></Field>
      <Field label="网站介绍" wide><textarea name="description" required minLength={10} maxLength={500} rows={4} defaultValue={config.description} className="w-full resize-y rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[11px] leading-5 outline-none focus:border-[var(--brand)]" /><small className="mt-1.5 block text-[9px] text-[var(--muted)]">用于首页品牌文案、浏览器描述和搜索引擎摘要。</small></Field>
      <Field label="ICP备案号" optional><Input name="icpNumber" maxLength={80} defaultValue={config.icpNumber} placeholder="例如：鄂ICP备xxxxxxxx号" /></Field>
      <Field label="公安备案号" optional><Input name="publicSecurityNumber" maxLength={100} defaultValue={config.publicSecurityNumber} placeholder="例如：鄂公网安备 xxxxxxxxxxxxxx号" /></Field>
    </div></section>

    <section className="panel overflow-hidden"><header className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">站点图标</h3><p className="mt-1 text-[9px] text-[var(--muted)]">原图保持完整比例展示，仅添加统一圆角，不再裁切图案。</p></header><div className="grid gap-5 p-5 md:grid-cols-[120px_minmax(0,1fr)] md:items-center">
      <span className="grid size-28 place-items-center overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)] p-2 text-[var(--muted)]">{iconPreview ? <Image src={iconPreview} alt="网站图标预览" width={112} height={112} unoptimized className="size-full rounded-[6px] object-contain" /> : <ImageIcon className="size-8" />}</span>
      <div className="space-y-3"><FileUploadField key={iconReset} name="siteIconFile" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon" maxBytes={512 * 1024} title="选择网站图标" description="支持 PNG、JPEG、WebP 或 ICO，最大 512 KB，建议使用正方形原图" onFilesChange={(files) => selectAsset(files, "icon")} /><div className="flex flex-wrap gap-2">{iconPreview && <Button type="button" onClick={() => resetIcon(true)} variant="outline" size="sm" className="text-[var(--danger)]"><Trash2 />移除图标</Button>}{iconAction !== "keep" && <Button type="button" onClick={() => resetIcon(false)} variant="secondary" size="sm"><RotateCcw />撤销更改</Button>}</div></div>
    </div></section>

    <section className="panel overflow-hidden"><header className="border-b border-[var(--line)] px-5 py-4"><h3 className="text-[13px] font-bold">门户首屏图片</h3><p className="mt-1 text-[9px] text-[var(--muted)]">建议使用横向清晰图片，主体靠左或居中，文字区域会自动添加可读性遮罩。</p></header><div className="space-y-4 p-5">
      <div className="relative aspect-[16/6] min-h-48 overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)]"><Image src={heroPreview} alt="门户首屏预览" fill unoptimized className="object-cover" sizes="(max-width: 1024px) 100vw, 960px" /><span className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[color-mix(in_srgb,var(--surface)_75%,transparent)]" /></div>
      <FileUploadField key={heroReset} name="siteHeroFile" accept="image/png,image/jpeg,image/webp" maxBytes={5 * 1024 * 1024} title="更换首屏图片" description="支持 PNG、JPEG、WebP，最大 5 MB；推荐尺寸不低于 1920 × 900" onFilesChange={(files) => selectAsset(files, "hero")} />
      <div className="flex flex-wrap gap-2">{config.hasCustomHero && <Button type="button" onClick={() => resetHero(true)} variant="outline" size="sm"><Trash2 />恢复默认图片</Button>}{heroAction !== "keep" && <Button type="button" onClick={() => resetHero(false)} variant="secondary" size="sm"><RotateCcw />撤销更改</Button>}</div>
    </div></section>

    {error && <p role="alert" className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2.5 text-[10px] text-[var(--danger)]">{error}</p>}
    <div className="flex items-center justify-end gap-3">{saved && <span role="status" className="inline-flex items-center gap-1.5 text-[10px] text-[var(--success)]"><CheckCircle2 className="size-3.5" />配置已生效</span>}<Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "正在保存" : "保存全部更改"}</Button></div>
  </form>;
}

function Field({ label, optional = false, wide = false, children }: { label: string; optional?: boolean; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "block sm:col-span-2" : "block"}><span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold">{label}{optional && <em className="not-italic font-normal text-[var(--muted)]">可选</em>}{label.includes("备案") && <ShieldCheck className="size-3 text-[var(--aqua)]" />}</span>{children}</label>;
}
