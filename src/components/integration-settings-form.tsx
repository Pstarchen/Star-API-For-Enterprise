"use client";

import { Check, CheckCircle2, Code2, Copy, CreditCard, ExternalLink, Eye, EyeOff, GitBranch as Github, KeyRound, Landmark, Link2, Loader2, Mail, MessageCircle, QrCode, Save, Send, ShieldCheck } from "lucide-react";
import { type FormEvent, useId, useMemo, useState } from "react";
import { absoluteOAuthUrl, GITHUB_OAUTH_CALLBACK_PATH, GITHUB_OAUTH_SCOPES, OAUTH_FRONTEND_CALLBACK_PATH, QQ_OAUTH_CALLBACK_PATH, QQ_OAUTH_SCOPE } from "@/lib/oauth";
import type { IntegrationKey } from "@/lib/server/integrations";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { FormMessage } from "./ui/form-field";
import { Input, Textarea } from "./ui/input";
import { Switch } from "./ui/switch";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

export type IntegrationSummary = {
  key: IntegrationKey;
  enabled: boolean;
  configured: boolean;
  secretConfigured?: boolean;
  publicConfig: Record<string, unknown>;
};

type FieldSpec = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  helper?: string;
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
    description: "OAuth 登录、账号绑定与新用户个人空间创建",
    icon: Github,
    fields: [
      { name: "clientId", label: "Client ID", placeholder: "GitHub OAuth Client ID", helper: "来自 GitHub OAuth App 的 Client ID。" },
      { name: "clientSecret", label: "Client Secret", placeholder: "GitHub OAuth Client Secret", helper: "仅在浏览器提交时传输，服务端加密保存且不会回传原文。", secret: true },
    ],
  },
  qq: {
    label: "QQ 登录",
    description: "QQ 互联 OAuth 登录、账号绑定与新用户个人空间创建",
    icon: MessageCircle,
    fields: [
      { name: "clientId", label: "App ID", placeholder: "QQ 互联网站应用 App ID", helper: "来自 QQ 互联管理中心的网站应用 App ID。" },
      { name: "clientSecret", label: "App Key", placeholder: "QQ 互联网站应用 App Key", helper: "仅在浏览器提交时传输，服务端加密保存且不会回传原文。", secret: true },
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
  "code-pay": {
    label: "码支付",
    description: "通用收款码或支付链接，付款后由管理员核验到账",
    icon: QrCode,
    fields: [
      { name: "paymentName", label: "收款方式名称", placeholder: "例如：微信/支付宝收款码" },
      { name: "qrImageUrl", label: "收款码图片地址", type: "url", placeholder: "https://example.com/payment-qr.png", helper: "建议使用 HTTPS 图片地址；不填写图片时可仅使用支付链接" },
      { name: "paymentUrl", label: "支付链接（可选）", type: "url", placeholder: "https://..." },
      { name: "instructions", label: "支付说明", multiline: true, placeholder: "请付款后保留订单号，等待管理员确认到账" },
    ],
  },
};

export function IntegrationSettingsForm({ initial, keys, publicUrl = "", eyebrow = "PLATFORM INTEGRATIONS", title = "登录、邮件与收款", description = "敏感凭据加密保存，后台只显示配置状态，不回传原文。" }: { initial: IntegrationSummary[]; keys?: IntegrationKey[]; publicUrl?: string; eyebrow?: string; title?: string; description?: string }) {
  const visibleKeys = keys?.length ? keys : Object.keys(definitions) as IntegrationKey[];
  const [items, setItems] = useState(initial);
  const [active, setActive] = useState<IntegrationKey>(visibleKeys[0]);
  const current = useMemo(
    () => items.find((item) => item.key === active) ?? { key: active, enabled: false, configured: false, secretConfigured: false, publicConfig: {} },
    [active, items],
  );

  return (
    <div className="page-shell max-w-3xl space-y-5">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold">{title}</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{description}</p>
      </div>
      <Tabs value={active} onValueChange={(value) => setActive(value as IntegrationKey)}>
      <TabsList className="grid h-auto w-full" style={{ gridTemplateColumns: `repeat(${visibleKeys.length}, minmax(0, 1fr))` }}>
        {visibleKeys.map((key) => {
          const item = items.find((value) => value.key === key);
          const Icon = definitions[key].icon;
          return (
            <TabsTrigger key={key} value={key} className="relative h-10 px-2 text-[9px]">
              <Icon className="size-3.5" />{definitions[key].label}
              <span className={`absolute right-1.5 top-1.5 size-1.5 rounded-full ${item?.enabled ? "bg-[var(--success)]" : "bg-[var(--line-strong)]"}`} />
            </TabsTrigger>
          );
        })}
      </TabsList></Tabs>
      <IntegrationEditor
        key={active}
        item={current}
        definition={definitions[active]}
        publicUrl={publicUrl}
        onSaved={(next) => setItems((values) => values.map((item) => item.key === next.key ? next : item))}
      />
    </div>
  );
}

function IntegrationEditor({ item, definition, publicUrl, onSaved }: { item: IntegrationSummary; definition: Definition; publicUrl: string; onSaved: (item: IntegrationSummary) => void }) {
  const [enabled, setEnabled] = useState(item.enabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testMessage, setTestMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
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
      for (const field of definition.fields) {
        if (!field.secret) continue;
        const secretField = formElement.elements.namedItem(field.name);
        if (secretField instanceof HTMLInputElement || secretField instanceof HTMLTextAreaElement) secretField.value = "";
      }
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
            <Badge variant={item.configured ? "brand" : "warning"}>{item.configured ? "凭据已配置" : "凭据未配置"}</Badge>
          </div>
          <p className="mt-1 text-[9px] text-[var(--muted)]">{definition.description}</p>
        </div>
        <label className="flex items-center gap-2 text-[10px] font-semibold">
          <span>{enabled ? "已启用" : "未启用"}</span>
          <Switch checked={enabled} onCheckedChange={(checked) => { setEnabled(checked); setSaved(false); }} />
        </label>
      </div>
      <form onSubmit={submit}>
        {item.key === "github" && <GitHubSetupGuide publicUrl={publicUrl} />}
        {item.key === "qq" && <QQSetupGuide publicUrl={publicUrl} />}
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {definition.fields.map((field) => <IntegrationField key={field.name} field={field} item={item} enabled={enabled} />)}
          {item.key === "smtp" && <label className="flex items-center gap-2 text-[10px]"><Checkbox name="secure" defaultChecked={item.publicConfig.secure === true} />使用 TLS 直连</label>}
          {item.secretConfigured && item.key !== "bank-transfer" && <label className="flex items-center gap-2 text-[9px] text-[var(--danger)]"><Checkbox name="removeSecrets" />保存时移除现有凭据</label>}
          {error && <FormMessage className="sm:col-span-2">{error}</FormMessage>}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-[var(--line)] px-5 py-4">
          {saved && <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--success)]"><CheckCircle2 className="size-3.5" />配置已保存</span>}
          <Button disabled={saving} size="sm">{saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "正在保存" : "保存配置"}</Button>
        </div>
      </form>
      {item.key === "smtp" && item.enabled && item.configured && (
        <div className="flex flex-col gap-2 border-t border-[var(--line)] bg-[var(--surface-subtle)] p-5 sm:flex-row">
          <Input type="email" value={testRecipient} onChange={(event) => setTestRecipient(event.target.value)} placeholder="测试收件邮箱" />
          <Button type="button" onClick={testSmtp} disabled={testing || !testRecipient} variant="secondary">{testing ? <Loader2 className="animate-spin" /> : <Send />}发送测试邮件</Button>
          {testMessage && <span className="self-center text-[9px] text-[var(--muted)]">{testMessage}</span>}
        </div>
      )}
    </section>
  );
}

function IntegrationField({ field, item, enabled }: { field: FieldSpec; item: IntegrationSummary; enabled: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const inputId = useId();
  const value = field.secret ? "" : String(item.publicConfig[field.name] ?? "");
  const placeholder = field.secret && item.secretConfigured ? "留空保留当前密钥" : field.placeholder;
  const required = (item.key === "github" || item.key === "qq") && enabled && (field.name === "clientId" || (field.name === "clientSecret" && !item.secretConfigured));
  return (
    <div className={field.multiline ? "block sm:col-span-2" : "block"}>
      <label htmlFor={inputId} className="mb-1.5 block text-[10px] font-semibold">{field.label}</label>
      {field.multiline ? (
        <Textarea id={inputId} name={field.name} rows={field.secret ? 4 : 3} defaultValue={value} placeholder={placeholder} required={required} className="mono text-[10px]" />
      ) : field.secret ? (
        <div className="relative">
          <Input id={inputId} name={field.name} type={revealed ? "text" : "password"} defaultValue={value} placeholder={placeholder} required={required} autoComplete="new-password" className="pr-11" />
          <Button type="button" variant="ghost" size="icon" onClick={() => setRevealed((current) => !current)} className="absolute right-0 top-0 size-10" aria-controls={inputId} aria-pressed={revealed} aria-label={revealed ? "隐藏输入内容" : "显示输入内容"} title={revealed ? `隐藏${field.label}` : `显示${field.label}`}>{revealed ? <EyeOff /> : <Eye />}</Button>
        </div>
      ) : (
        <Input id={inputId} name={field.name} type={field.type ?? "text"} defaultValue={value} placeholder={placeholder} required={required} autoComplete="off" />
      )}
      {(field.helper || field.secret) && <small className="mt-1 block text-[9px] leading-4 text-[var(--muted)]">{field.helper ?? "新值提交后加密保存，页面不会再次显示。"}</small>}
    </div>
  );
}

function GitHubSetupGuide({ publicUrl }: { publicUrl: string }) {
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const homepageUrl = publicOrigin(publicUrl);
  const backendCallbackUrl = oauthAddress(publicUrl, GITHUB_OAUTH_CALLBACK_PATH);

  async function copy(value: string, key: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? "" : current), 1400);
    } catch {
      setCopyError("浏览器未授权写入剪贴板，请手动选中地址复制。");
    }
  }

  return <div className="border-b border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--ink)] text-[var(--surface)]"><Github className="size-4" /></span><div><strong className="block text-[12px]">创建 GitHub OAuth App</strong><p className="mt-1 max-w-xl text-[10px] leading-5 text-[var(--muted)]">GitHub 登录需要读取公开资料和已验证邮箱。请使用下面生成的地址创建 OAuth App，再填写凭据并启用。</p></div></div>
      <Button asChild type="button" variant="secondary" size="sm"><a href="https://github.com/settings/developers" target="_blank" rel="noreferrer">打开 OAuth Apps<ExternalLink /></a></Button>
    </div>

    <ol className="mt-5 grid border-y border-[var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-[var(--line)]">
      <SetupStep number="01" title="新建应用" text="GitHub Settings → Developer settings → OAuth Apps → New OAuth App" />
      <SetupStep number="02" title="填写地址" text="Homepage URL 使用站点域名；Authorization callback URL 使用后端回调地址。" />
      <SetupStep number="03" title="保存并启用" text="生成 Client Secret，填入下方凭据；保存成功后再开启 GitHub 登录。" />
    </ol>

    <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px]"><ShieldCheck className="size-3.5 text-[var(--success)]" /><span className="font-semibold">所需权限</span>{GITHUB_OAUTH_SCOPES.map((scope) => <code key={scope} className="rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-1 text-[9px] text-[var(--brand-strong)]">{scope}</code>)}</div>

    <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
      <OAuthAddress icon={Link2} label="Homepage URL" description="填写站点公开访问域名" value={homepageUrl} copied={copied === "home"} copyLabel="复制" onCopy={() => copy(homepageUrl, "home")} />
      <OAuthAddress icon={KeyRound} label="后端回调地址" description="填写到 Authorization callback URL" value={backendCallbackUrl} copied={copied === "backend"} copyLabel="生成并复制" onCopy={() => copy(backendCallbackUrl, "backend")} />
      <OAuthAddress icon={CheckCircle2} label="前端回调地址" description="后端验证成功后的平台内部完成页，无需填写到 GitHub" value={OAUTH_FRONTEND_CALLBACK_PATH} copied={copied === "frontend"} copyLabel="复制" onCopy={() => copy(OAUTH_FRONTEND_CALLBACK_PATH, "frontend")} />
    </div>
    {copyError && <FormMessage className="mt-3">{copyError}</FormMessage>}
  </div>;
}

function QQSetupGuide({ publicUrl }: { publicUrl: string }) {
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const homepageUrl = publicOrigin(publicUrl);
  const backendCallbackUrl = oauthAddress(publicUrl, QQ_OAUTH_CALLBACK_PATH);

  async function copy(value: string, key: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => current === key ? "" : current), 1400);
    } catch {
      setCopyError("浏览器未授权写入剪贴板，请手动选中地址复制。");
    }
  }

  return <div className="border-b border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[#12b7f5] text-white"><MessageCircle className="size-4" /></span><div><strong className="block text-[12px]">创建 QQ 互联网站应用</strong><p className="mt-1 max-w-xl text-[10px] leading-5 text-[var(--muted)]">请在 QQ 互联管理中心创建网站应用，填写站点域名和后端回调地址，再把 App ID 与 App Key 填入下方。</p></div></div>
      <Button asChild type="button" variant="secondary" size="sm"><a href="https://connect.qq.com/manage/" target="_blank" rel="noreferrer">打开 QQ 互联管理中心<ExternalLink /></a></Button>
    </div>

    <ol className="mt-5 grid border-y border-[var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-[var(--line)]">
      <SetupStep number="01" title="创建网站应用" text="进入 QQ 互联管理中心，创建网站应用并完成域名验证。" />
      <SetupStep number="02" title="填写回调地址" text="将后端回调地址填写到应用的回调地址配置，并保持域名一致。" />
      <SetupStep number="03" title="保存并启用" text="复制 App ID 与 App Key，填入下方凭据；保存成功后再开启 QQ 登录。" />
    </ol>

    <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px]"><ShieldCheck className="size-3.5 text-[var(--success)]" /><span className="font-semibold">请求权限</span><code className="rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] px-2 py-1 text-[9px] text-[var(--brand-strong)]">{QQ_OAUTH_SCOPE}</code></div>

    <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
      <OAuthAddress icon={Link2} label="Homepage URL" description="填写站点公开访问域名" value={homepageUrl} copied={copied === "home"} copyLabel="复制" onCopy={() => copy(homepageUrl, "home")} />
      <OAuthAddress icon={KeyRound} label="后端回调地址" description="填写到 QQ 互联网站应用回调地址" value={backendCallbackUrl} copied={copied === "backend"} copyLabel="生成并复制" onCopy={() => copy(backendCallbackUrl, "backend")} />
      <OAuthAddress icon={CheckCircle2} label="前端回调地址" description="平台内部完成页，无需填写到 QQ 互联" value={OAUTH_FRONTEND_CALLBACK_PATH} copied={copied === "frontend"} copyLabel="复制" onCopy={() => copy(OAUTH_FRONTEND_CALLBACK_PATH, "frontend")} />
    </div>
    {copyError && <FormMessage className="mt-3">{copyError}</FormMessage>}
  </div>;
}

function SetupStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <li className="flex gap-3 py-3 sm:px-4 sm:first:pl-0 sm:last:pr-0"><span className="mono text-[9px] font-bold text-[var(--brand)]">{number}</span><span><strong className="block text-[10px]">{title}</strong><small className="mt-1 block text-[9px] leading-4 text-[var(--muted)]">{text}</small></span></li>;
}

function OAuthAddress({ icon: Icon, label, description, value, copied, copyLabel, onCopy }: { icon: typeof Link2; label: string; description: string; value: string; copied: boolean; copyLabel: string; onCopy: () => void }) {
  return <div className="grid items-center gap-3 py-3 sm:grid-cols-[156px_minmax(0,1fr)_auto]">
    <span className="flex items-center gap-2"><Icon className="size-3.5 text-[var(--brand)]" /><span><strong className="block text-[10px]">{label}</strong><small className="mt-0.5 block text-[8px] text-[var(--muted)]">{description}</small></span></span>
    <code className="min-w-0 overflow-x-auto whitespace-nowrap rounded-[6px] bg-[var(--surface-raised)] px-3 py-2 text-[10px] text-[var(--ink)] shadow-[var(--shadow-inset)]">{value}</code>
    <Button type="button" variant="secondary" size="sm" onClick={onCopy} aria-label={`${copied ? "已复制" : copyLabel}${label}`}>{copied ? <Check className="text-[var(--success)]" /> : <Copy />}{copied ? "已复制" : copyLabel}</Button>
  </div>;
}

function publicOrigin(publicUrl: string) {
  try { return new URL(publicUrl).origin; } catch { return "请先在基础设置填写网站公开访问地址"; }
}

function oauthAddress(publicUrl: string, path: string) {
  try { return absoluteOAuthUrl(publicUrl, path); } catch { return path; }
}
