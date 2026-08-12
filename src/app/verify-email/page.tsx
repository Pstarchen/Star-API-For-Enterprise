import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { EmailVerificationComplete } from "@/components/email-verification-complete";

export default function VerifyEmailPage() {
  return <AuthShell title="验证你的邮箱" description="输入邮件中的 6 位验证码，验证后会自动进入控制台。"><Suspense fallback={<p className="text-sm text-[var(--muted)]">正在准备邮箱验证...</p>}><EmailVerificationComplete /></Suspense></AuthShell>;
}
