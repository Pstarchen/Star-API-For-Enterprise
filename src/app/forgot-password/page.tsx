import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/password-reset-form";

export default function ForgotPasswordPage() {
  return <AuthShell title="找回密码" description="输入注册邮箱，我们会发送一条 30 分钟内有效的重置链接。"><ForgotPasswordForm /></AuthShell>;
}
