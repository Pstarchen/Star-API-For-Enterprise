"use client";

import { CheckCircle2, Loader2, LockKeyhole, Save, UserPlus } from "lucide-react";
import { useState } from "react";
import type { AuthPolicy } from "@/lib/server/auth-policy";

export function AuthPolicyForm({ initial }: { initial: AuthPolicy }) {
  const [policy, setPolicy] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/v1/admin/auth-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? "登录策略保存失败");
        return;
      }
      setPolicy(result.data);
      setSaved(true);
    } catch {
      setError("无法连接登录策略服务");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <div>
        <p className="eyebrow">AUTHENTICATION POLICY</p>
        <h2 className="mt-1 text-xl font-bold">登录与注册策略</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">登录入口与接口同步生效；系统会阻止导致管理员无法登录的配置。</p>
      </div>
      <div className="panel overflow-hidden">
        <PolicyToggle
          icon={LockKeyhole}
          title="邮箱密码登录"
          description="允许已有用户使用邮箱和密码登录。关闭前必须有管理员已绑定可用的 GitHub 登录。"
          checked={policy.passwordLoginEnabled}
          onChange={(checked) => setPolicy((value) => ({ ...value, passwordLoginEnabled: checked, registrationEnabled: checked ? value.registrationEnabled : false }))}
        />
        <PolicyToggle
          icon={UserPlus}
          title="开放新用户注册"
          description="允许个人与企业用户创建账号，也控制 GitHub 首次登录自动创建新账号。"
          checked={policy.registrationEnabled}
          disabled={!policy.passwordLoginEnabled}
          onChange={(checked) => setPolicy((value) => ({ ...value, registrationEnabled: checked }))}
        />
        {error && <p role="alert" className="mx-5 mb-4 rounded-[6px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--line)] px-5 py-4">
          {saved && <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--success)]"><CheckCircle2 className="size-3.5" />策略已生效</span>}
          <button type="button" onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{saving ? "正在保存" : "保存登录策略"}
          </button>
        </div>
      </div>
    </section>
  );
}

function PolicyToggle({ icon: Icon, title, description, checked, disabled, onChange }: { icon: typeof LockKeyhole; title: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`flex items-start gap-3 border-b border-[var(--line)] px-5 py-4 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <span className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-[var(--brand-soft)] text-[var(--brand)]"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[12px] font-bold">{title}</span><span className="mt-1 block text-[9px] leading-4 text-[var(--muted)]">{description}</span></span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-2 size-4 accent-[var(--brand)]" />
    </label>
  );
}
