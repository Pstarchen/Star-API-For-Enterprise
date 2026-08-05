"use client";

import { Eye, EyeOff, ImageIcon, Loader2, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export function InstallationForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [iconDataUrl, setIconDataUrl] = useState("");

  function selectIcon(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      setError("网站图标不能超过 512 KB");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setIconDataUrl(typeof reader.result === "string" ? reader.result : "");
      setError("");
    };
    reader.onerror = () => setError("无法读取网站图标");
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installToken: form.get("installToken"),
          platformName: form.get("platformName"),
          platformDescription: form.get("platformDescription"),
          publicUrl: form.get("publicUrl"),
          iconDataUrl: iconDataUrl || undefined,
          adminName: form.get("adminName"),
          adminEmail: form.get("adminEmail"),
          adminPassword: form.get("adminPassword"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? "安装配置未能保存");
        return;
      }
      router.push(result.data.next);
      router.refresh();
    } catch {
      setError("无法连接安装服务，请检查服务状态");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "h-11 w-full border border-[var(--line)] bg-white px-3 text-[12px] outline-none focus:border-[var(--brand)]";
  return <form onSubmit={submit} className="space-y-4">
    <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">部署令牌</span><input name="installToken" required type="password" autoComplete="off" placeholder="服务器 INSTALL_TOKEN" className={inputClass} /></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">平台名称</span><input name="platformName" required minLength={2} defaultValue="Star-API" className={inputClass} /></label>
      <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">访问地址</span><input name="publicUrl" required type="url" placeholder="https://api.example.com" className={inputClass} /></label>
    </div>
    <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">网站介绍</span><textarea name="platformDescription" required minLength={10} maxLength={500} defaultValue="面向个人开发者与企业团队的公共 API 聚合、开放与分发平台。" rows={3} className="w-full resize-y border border-[var(--line)] bg-white px-3 py-2.5 text-[12px] leading-5 outline-none focus:border-[var(--brand)]" /></label>
    <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">网站图标</span><span className="flex min-h-16 items-center gap-3 border border-dashed border-[var(--line-strong)] bg-[var(--surface-subtle)] p-3"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[5px] bg-[var(--surface)] text-[var(--muted)]">{iconDataUrl ? <Image src={iconDataUrl} alt="网站图标预览" width={40} height={40} unoptimized className="size-full object-cover" /> : <ImageIcon className="size-5" />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[10px] font-semibold"><Upload className="size-3.5" />选择图标</span><small className="mt-1 block text-[9px] text-[var(--muted)]">PNG、JPEG、WebP 或 ICO，最大 512 KB</small></span><input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon" onChange={selectIcon} className="max-w-28 text-[9px] text-[var(--muted)] file:hidden" /></span></label>
    <div className="border-t border-[var(--line)] pt-4">
      <p className="mb-4 text-[11px] font-bold">平台管理员</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">姓名</span><input name="adminName" required minLength={2} autoComplete="name" className={inputClass} /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">邮箱</span><input name="adminEmail" required type="email" autoComplete="email" className={inputClass} /></label>
      </div>
    </div>
    <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">管理员密码</span><span className="flex h-11 items-center border border-[var(--line)] bg-white focus-within:border-[var(--brand)]"><input name="adminPassword" required minLength={10} maxLength={72} type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="至少 10 位，包含字母和数字" className="min-w-0 flex-1 px-3 text-[12px] outline-none" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="grid size-10 place-items-center text-[var(--muted)]" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label>
    {error && <p role="alert" className="rounded-[4px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}
    <button type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-[4px] bg-[var(--brand)] text-[11px] font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-60">{loading && <Loader2 className="size-4 animate-spin" />}{loading ? "正在初始化" : "完成安装并进入后台"}</button>
  </form>;
}
