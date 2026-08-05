import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
export const metadata: Metadata = { title: "登录" };
export default function LoginPage() { return <AuthShell title="登录星枢" description="进入你的个人空间或企业工作区，继续管理接口与调用。"><LoginForm /></AuthShell>; }
