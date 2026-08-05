import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { RegistrationForm } from "@/components/registration-form";
export const metadata: Metadata = { title: "免费注册" };
export default function RegisterPage() { return <AuthShell title="创建星枢账号" description="个人项目可以直接开始，企业账号可在同一平台管理团队、权限和统一账单。"><RegistrationForm /></AuthShell>; }
