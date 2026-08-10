import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { RegistrationForm } from "@/components/registration-form";
import { getCurrentUser } from "@/lib/server/auth";
import { getPlatformConfig, isInstalled } from "@/lib/server/installation";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { getAuthPolicy } from "@/lib/server/auth-policy";
export const metadata: Metadata = { title: "免费注册" };
export default async function RegisterPage() {
  await connection();
  if (!(await isInstalled())) redirect("/install");
  const user = await getCurrentUser();
  if (user) redirect(user.platformRole === "ADMIN" ? "/admin" : "/console");
  const platform = await getPlatformConfig();
  const authPolicy = await getAuthPolicy();
  if (!authPolicy.registrationEnabled || !authPolicy.passwordLoginEnabled) {
    return <AuthShell title="注册暂未开放" description="平台管理员当前已关闭新用户注册。"><Link href="/login" className="flex h-11 w-full items-center justify-center rounded-[6px] bg-[var(--brand)] text-[11px] font-semibold text-white">返回登录</Link></AuthShell>;
  }
  return <AuthShell title={`创建 ${platform.name} 账号`} description="个人项目可以直接开始，企业账号可在同一平台管理团队、权限和统一账单。"><RegistrationForm /></AuthShell>;
}
