"use client";

import Link from "next/link";
import { Building2, CheckCircle2, Eye, EyeOff, Loader2, UserRound } from "lucide-react";
import { FormEvent, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { FormField, FormLabel, FormMessage } from "./ui/form-field";
import { Input, InputGroup } from "./ui/input";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

type AccountType = "personal" | "enterprise";

export function RegistrationForm() {
  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ workspace: string; nextStep: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountType, name: form.get("name"), email: form.get("email"), password: form.get("password"), companyName: form.get("companyName") || undefined, acceptedTerms: form.get("acceptedTerms") === "on" }) });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "注册信息无法提交"); return; }
      setSuccess({ workspace: result.data.workspace.name, nextStep: result.data.nextStep });
    } catch {
      setError("无法连接注册服务，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  if (success) return <Card className="border-[var(--success-line)] bg-[var(--success-soft)]"><CardContent><span className="grid size-10 place-items-center rounded-[8px] bg-[var(--surface-raised)] text-[var(--success)]"><CheckCircle2 className="size-5" /></span><h2 className="mt-4 text-[17px] font-bold">账号创建成功</h2><p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">工作区“{success.workspace}”已准备完成。{success.nextStep === "VERIFY_ENTERPRISE" ? "完成企业认证后即可申请生产配额。" : "现在可以创建第一枚 API Key。"}</p><Button asChild className="mt-5"><Link href="/console">进入控制台</Link></Button></CardContent></Card>;

  return <form onSubmit={handleSubmit} className="space-y-4">
    <Tabs value={accountType} onValueChange={(value) => setAccountType(value as AccountType)}><TabsList className="grid h-auto w-full grid-cols-2"><TabsTrigger value="personal" className="h-9"><UserRound className="size-4" />个人用户</TabsTrigger><TabsTrigger value="enterprise" className="h-9"><Building2 className="size-4" />企业用户</TabsTrigger></TabsList></Tabs>
    <FormField><FormLabel>姓名</FormLabel><Input name="name" required minLength={2} autoComplete="name" placeholder="你的姓名" className="h-11 text-[12px]" /></FormField>
    {accountType === "enterprise" && <FormField><FormLabel>企业名称</FormLabel><Input name="companyName" required autoComplete="organization" placeholder="企业工商登记全称" className="h-11 text-[12px]" /></FormField>}
    <FormField><FormLabel>邮箱</FormLabel><Input name="email" required type="email" autoComplete="email" placeholder="name@example.com" className="h-11 text-[12px]" /></FormField>
    <FormField><FormLabel>密码</FormLabel><InputGroup className="h-11"><Input name="password" required minLength={10} maxLength={72} type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="至少 10 位，包含字母和数字" className="text-[12px]" /><Button type="button" variant="ghost" size="icon" onClick={() => setShowPassword((value) => !value)} className="mr-1" aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff /> : <Eye />}</Button></InputGroup></FormField>
    <label className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"><Checkbox name="acceptedTerms" required className="mt-0.5" />我已阅读并同意服务协议和隐私政策</label>
    {error && <FormMessage>{error}</FormMessage>}
    <Button type="submit" size="lg" disabled={loading} className="w-full">{loading && <Loader2 className="animate-spin" />}{loading ? "正在创建账号" : accountType === "enterprise" ? "创建企业账号" : "创建个人账号"}</Button>
    <p className="text-center text-xs text-[var(--muted)]">已有账号？ <Link href="/login" className="font-semibold text-[var(--brand)]">登录</Link></p>
  </form>;
}
