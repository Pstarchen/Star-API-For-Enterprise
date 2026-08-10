"use client";

import { Check, Copy, Eye, EyeOff, ImageIcon, Loader2, ShieldCheck, SquareTerminal, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { FormField, FormHint, FormLabel, FormMessage } from "./ui/form-field";
import { Input, InputGroup, Textarea } from "./ui/input";

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

  return <form onSubmit={submit} className="space-y-4">
    <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><FormLabel>部署令牌</FormLabel><InstallTokenHelp /></div><Input name="installToken" required type="password" autoComplete="off" placeholder="粘贴服务器返回的部署令牌" className="h-11 text-[12px]" /></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField><FormLabel>平台名称</FormLabel><Input name="platformName" required minLength={2} defaultValue="Star-API" className="h-11 text-[12px]" /></FormField>
      <FormField><FormLabel>访问地址</FormLabel><Input name="publicUrl" required type="url" placeholder="https://api.example.com" className="h-11 text-[12px]" /></FormField>
    </div>
    <FormField><FormLabel>网站介绍</FormLabel><Textarea name="platformDescription" required minLength={10} maxLength={500} defaultValue="面向个人开发者与企业团队的公共 API 聚合、开放与分发平台。" rows={3} className="text-[12px]" /></FormField>
    <div className="space-y-1.5"><FormLabel>网站图标</FormLabel><label className="flex min-h-20 cursor-pointer items-center gap-3 rounded-[var(--radius-panel)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-subtle)] p-3 transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]"><span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[7px] border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--muted)]">{iconDataUrl ? <Image src={iconDataUrl} alt="网站图标预览" width={44} height={44} unoptimized className="size-full object-cover" /> : <ImageIcon className="size-5" />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[10px] font-semibold"><Upload className="size-3.5 text-[var(--brand)]" />选择图标</span><FormHint className="mt-1">PNG、JPEG、WebP 或 ICO，最大 512 KB</FormHint></span><span className="rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-[9px] font-semibold text-[var(--muted)]">浏览文件</span><input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon" onChange={selectIcon} className="sr-only" /></label></div>
    <div className="border-t border-[var(--line)] pt-4">
      <p className="mb-4 text-[12px] font-bold">平台管理员</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField><FormLabel>姓名</FormLabel><Input name="adminName" required minLength={2} autoComplete="name" className="h-11 text-[12px]" /></FormField>
        <FormField><FormLabel>邮箱</FormLabel><Input name="adminEmail" required type="email" autoComplete="email" className="h-11 text-[12px]" /></FormField>
      </div>
    </div>
    <FormField><FormLabel>管理员密码</FormLabel><InputGroup className="h-11"><Input name="adminPassword" required minLength={10} maxLength={72} type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="至少 10 位，包含字母和数字" className="text-[12px]" /><Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} className="mr-1" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff /> : <Eye />}</Button></InputGroup></FormField>
    {error && <FormMessage>{error}</FormMessage>}
    <Button type="submit" size="lg" disabled={loading} className="w-full">{loading && <Loader2 className="animate-spin" />}{loading ? "正在初始化" : "完成安装并进入后台"}</Button>
  </form>;
}

function InstallTokenHelp() {
  const [copied, setCopied] = useState("");
  const commands = [
    { label: "项目目录", value: "npm run --silent install:token" },
    { label: "标准 Compose 环境", value: "docker compose exec app node /app/scripts/show-install-token.mjs" },
  ];

  async function copy(command: string) {
    let copiedSuccessfully = false;
    try {
      await navigator.clipboard.writeText(command);
      copiedSuccessfully = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = command;
      textarea.readOnly = true;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      copiedSuccessfully = document.execCommand("copy");
      textarea.remove();
    }
    setCopied(copiedSuccessfully ? command : "");
    if (copiedSuccessfully) window.setTimeout(() => setCopied(""), 1600);
  }

  return <Dialog><DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[9px] text-[var(--brand-strong)]"><SquareTerminal />获取令牌</Button></DialogTrigger><DialogContent className="max-w-[520px]"><DialogHeader><DialogTitle>获取部署令牌</DialogTitle><DialogDescription>在运行平台的服务器项目目录执行命令。</DialogDescription></DialogHeader><DialogBody className="space-y-3">{commands.map((command, index) => <div key={command.value} className="rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface-subtle)] p-3"><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-semibold text-[var(--muted)]">{command.label}</span>{index === 0 && <span className="text-[8px] font-semibold text-[var(--brand-strong)]">推荐</span>}</div><div className="flex items-center gap-2"><code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-[6px] bg-[var(--surface)] px-3 py-2.5 text-[10px] text-[var(--ink)]">{command.value}</code><Button type="button" variant="secondary" size="icon" onClick={() => copy(command.value)} aria-label={`${copied === command.value ? "已复制" : "复制"}${command.label}命令`}>{copied === command.value ? <Check className="text-[var(--success)]" /> : <Copy />}</Button></div></div>)}<div className="flex gap-2 rounded-[var(--radius-control)] border border-[var(--success-line)] bg-[var(--success-soft)] p-3 text-[9px] leading-5 text-[var(--success)]"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /><span>命令仅在平台尚未安装时返回令牌；完成初始化后会自动拒绝再次显示。</span></div></DialogBody></DialogContent></Dialog>;
}
