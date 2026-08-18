"use client";

import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { OAuthProvider } from "@/lib/oauth";
import { Button } from "./ui/button";

export function OAuthCallbackComplete({ provider, nextPath }: { provider: OAuthProvider; nextPath: string }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace(nextPath);
      router.refresh();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [nextPath, router]);

  return <div role="status" className="space-y-4">
    <div className="flex items-start gap-3 rounded-[var(--radius-panel)] border border-[var(--success-line)] bg-[var(--success-soft)] p-4 text-[var(--success)]">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
      <div><strong className="block text-[13px]">{provider === "qq" ? "QQ" : "GitHub"} 身份验证完成</strong><p className="mt-1 text-[11px] leading-5">安全会话已经建立，正在进入你的工作空间。</p></div>
    </div>
    <Button asChild variant="secondary" className="w-full"><Link href={nextPath}><Loader2 className="animate-spin" />立即继续</Link></Button>
  </div>;
}
