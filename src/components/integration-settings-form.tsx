"use client";

import { CheckCircle2, Code2, CreditCard, GitBranch, Landmark, Loader2, Mail, Save, Send } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { IntegrationKey } from "@/lib/server/integrations";

export type IntegrationSummary = {
  key: IntegrationKey;
  enabled: boolean;
  configured: boolean;
  publicConfig: Record<string, unknown>;
};

type FieldSpec = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  secret?: boolean;
  multiline?: boolean;
};

type Definition = {
  label: string;
  description: string;
  icon: typeof Code2;
  fields: FieldSpec[];
};

const definitions: Record<IntegrationKey, Definition> = {
  github: {
    label: "GitHub 登录",
    description: "OAuth 登录、账号绑定与个人空间自动创建",
    icon: GitBranch,
    fields: [
      { name: "clientId", label: "OAuth Client ID" },
      { name: "clientSecret", label: "OAuth Client Secret", secret: true },
    ],
  },
  smtp: {
    label: "邮件服务",
    description: "SMTP 系统通知、验证邮件和账单投递",
    icon: Mail,
    fields: [
      { name: "host", label: "SMTP 主机" },
      { name: "port", label: "端口", type: "number" },
      { name: "fromName", label: "发件人名称" },
      { name: "fromEmail", label: "发件邮箱", type: "email" },
      { name: "username", label: "登录用户名" },
      { name: "password", label: "登录密码或授权码", secret: true },
    ],
  },
  alipay: {
    label: "支付宝",
    description: "支付宝开放平台应用与异步通知配置",
    icon: CreditCard,
    fields: [
      { name: "appId", label: "应用 App ID" },
      { name: "gatewayUrl", label: "网关地址", type: "url", placeholder: "https://openapi.alipay.com/gateway.do" },
      { name: "notifyUrl", label: "异步通知地址", type: "url" },
      { name: "privateKey", label: "应用私钥", secret: true, multiline: true },
      { name: "alipayPublicKey", label: "支付宝公钥", secret: true, multiline: true },
    ],
  },
  wechat: {
    label: "微信支付",
    description: "微信支付 API v3 商户与证书配置",
    icon: CreditCard,
    fields: [
      { name: "merchantId", label: "商户号" },
      { name: "appId", label: "关联 App ID" },
      { name: "serialNo", label: "商户证书序列号" },
      { name: "platformSerialNo", label: "微信支付平台证书序列号" },
      { name: "notifyUrl", label: "支付通知地址", type: "url" },
      { name: "privateKey", label: "商户 API 私钥", secret: true, multiline: true },
      { name: "apiV3Key", label: "API v3 密钥", secret: true },
      { name: "platformPublicKey", label: "微信支付平台公钥", secret: true, multiline: true },
    ],
  },
  "bank-transfer": {
    label: "对公转账",
    description: "线下汇款收款账户与付款说明",
    icon: Landmark,
    fields: [
      { name: "accountName", label: "账户名称" },
      { name: "bankName", label: "开户银行" },
      { name: "accountNumber", label: "银行账号" },
      { name: "instructions", label: "汇款说明", multiline: true },
    ],
  },
};

const inputClass = "h-10 w-full rounded-[6px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11px] outline-none focus:border-[var(--brand)]";

export function IntegrationSettingsForm({ initial }: { initial: IntegrationSummary[] }) {
  const [items, setItems] = useState(initial);
  const [active, setActive] = useState<IntegrationKey>("github");
  const current = useMemo(
    () => items.find((item) => item.key === active) ?? { key: active, enabled: false, configured: false, publicConfig: {} },
    [active, items],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="eyebrow">PLATFORM INTEGRATIONS</p>
        <h2 className="mt-1 text-xl font-bold">登录、邮件与收款</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">敏感凭据加密保存，后台只显示配置状态，不回传原文。</p>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)] p-1 sm:grid-cols-5">
        {(Object.keys(definitions) as IntegrationKey[]).map((key) => {
          const item = items.find((value) => value.key === key);
          const Icon = definitions[key].icon;
          return (
            <button key={key} onClick={() => setActive(key)} className={`relative flex h-12 items-center justify-center gap-2 rounded-[6px] px-2 text-[9px] font-semibold ${active === key ? "bg-[var(--surface)] text-[var(--brand)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}>
              <Icon className="size-3.5" />{definitions[key].label}
              <span className={`absolute right-1.5 top-1.5 size-1.5 rounded-full ${item?.enabled ? "bg-[var(--success)]" : "bg-[var(--line-strong)]"}`} />
            </button>
          );
        })}
      </div>
      <IntegrationEditor
        key={active}
        item={current}
        definition={definitions[active]}
        onSaved={(next) => setItems((values) => values.map((item) => item.key === next.key ? next : item))}
      />
    </div>
  );
}

function IntegrationEditor({ item, definition, onSaved }: { item: IntegrationSummary; definition: Definition; onSaved: (item: IntegrationSummary) => void }) {
  const [enabled, setEnabled] = useState(item.enabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    const form = new FormData(event.currentTarget);
    const publicConfig: Record<string, string | number | boolean> = {};
    const secrets: Record<string, string> = {};
    for (const field of definition.fields) {
      const value = String(form.get(field.name) ?? "").trim();
      if (field.secret) {
        if (value) secrets[field.name] = value;
      } else {
        publicConfig[field.name] = field.type === "number" ? Number(value) : value;
      }
    }
    if (item.key === "smtp") publicConfig.secure = form.get("secure") === "on";
    const removeSecrets = form.get("removeSecrets") === "on";
    try {
      const response = await fetch("/api/v1/admin/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key, enabled, publicConfig, secrets, secretAction: removeSecrets ? "remove" : Object.keys(secrets).length ? "replace" : "keep" }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message ?? "配置保存失败");
        return;
      }
      onSaved(result.data);
      setSaved(true);
    } catch {
      setError("无法连接集成配置服务");
    } finally {
      setSaving(false);
    }
  }

  async function testSmtp() {
    setTesting(true);
    setTestMessage("");
    try {
      const response = await fetch("/api/v1/admin/integrations/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: testRecipient }),
      });
      const result = await response.json();
      setTestMessage(result.message ?? (response.ok ? "测试邮件已发送" : "测试失败"));
    } catch {
      setTestMessage("无法连接邮件测试服务");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-bold">{definition.label}</h3>
            <span className={`rounded-[4px] px-2 py-1 text-[8px] font-semibold ${item.configured ? "bg-[var(--brand-soft)] text-[var(--brand-strong)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{item.configured ? "凭据已配置" : "凭据未配置"}</span>
          </div>
          <p className="mt-1 text-[9px] text-[var(--muted)]">{definition.description}</p>
        </div>
        <label className="flex items-center gap-2 text-[10px] font-semibold">
          <span>{enabled ? "已启用" : "未启用"}</span>
          <input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setSaved(false); }} className="size-4 accent-[var(--brand)]" />
        </label>
      </div>
      <form onSubmit={submit}>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {definition.fields.map((field) => <IntegrationField key={field.name} field={field} item={item} />)}
          {item.key === "smtp" && <label className="flex items-center gap-2 text-[10px]"><input name="secure" type="checkbox" defaultChecked={item.publicConfig.secure === true} />使用 TLS 直连</label>}
          {item.configured && item.key !== "bank-transfer" && <label className="flex items-center gap-2 text-[9px] text-[var(--danger)]"><input name="removeSecrets" type="checkbox" />保存时移除现有凭据</label>}
          {error && <p role="alert" className="sm:col-span-2 rounded-[6px] bg-[var(--danger-soft)] px-3 py-2 text-[10px] text-[var(--danger)]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[var(--line)] px-5 py-4">
          {saved && <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--success)]"><CheckCircle2 className="size-3.5" />配置已保存</span>}
          <button disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[var(--brand)] px-4 text-[10px] font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{saving ? "正在保存" : "保存配置"}
          </button>
        </div>
      </form>
      {item.key === "smtp" && item.enabled && item.configured && (
        <div className="flex flex-col gap-2 border-t border-[var(--line)] bg-[var(--surface-subtle)] p-5 sm:flex-row">
          <input type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="测试收件邮箱" className={inputClass} />
          <button onClick={testSmtp} disabled={testing || !testRecipient} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[6px] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[10px] font-semibold disabled:opacity-50">
            {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}发送测试邮件
          </button>
          {testMessage && <span className="self-center text-[9px] text-[var(--muted)]">{testMessage}</span>}
        </div>
      )}
    </section>
  );
}

function IntegrationField({ field, item }: { field: FieldSpec; item: IntegrationSummary }) {
  const value = field.secret ? "" : String(item.publicConfig[field.name] ?? "");
  const placeholder = field.secret && item.configured ? "留空保留当前密钥" : field.placeholder;
  return (
    <label className={field.multiline ? "block sm:col-span-2" : "block"}>
      <span className="mb-1.5 block text-[10px] font-semibold">{field.label}</span>
      {field.multiline ? (
        <textarea name={field.name} rows={field.secret ? 4 : 3} defaultValue={value} placeholder={placeholder} className="mono w-full rounded-[6px] border border-[var(--line)] bg-[var(--surface)] p-3 text-[10px] leading-5 outline-none focus:border-[var(--brand)]" />
      ) : (
        <input name={field.name} type={field.secret ? "password" : field.type ?? "text"} defaultValue={value} placeholder={placeholder} autoComplete="off" className={inputClass} />
      )}
      {field.secret && <small className="mt-1 block text-[8px] text-[var(--muted)]">新值提交后加密保存，页面不会再次显示。</small>}
    </label>
  );
}
