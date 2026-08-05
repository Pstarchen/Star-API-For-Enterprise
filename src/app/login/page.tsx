import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/server/auth";
import { getPlatformConfig, isInstalled } from "@/lib/server/installation";
import { redirect } from "next/navigation";
import { connection } from "next/server";
export const metadata: Metadata = { title: "登录" };
export default async function LoginPage() {
  await connection();
  if (!(await isInstalled())) redirect("/install");
  const user = await getCurrentUser();
  if (user) redirect(user.platformRole === "ADMIN" ? "/admin" : "/console");
  const platform = await getPlatformConfig();
  return <AuthShell title={`登录 ${platform.name}`} description="进入你的个人空间或企业工作区，继续管理接口与调用。"><LoginForm /></AuthShell>;
}
