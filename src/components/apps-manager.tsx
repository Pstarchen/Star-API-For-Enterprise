"use client";

import { Check, Copy, KeyRound, Loader2, Pause, Play, Plus, ShieldX, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import type { ApplicationView } from "@/lib/applications";
import type { CatalogProduct } from "@/lib/catalog";
import { Button } from "./ui/button";
import { ConfirmDialog } from "./ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./ui/select";

type ConfirmTarget =
  | { type: "subscription"; app: ApplicationView; subscription: ApplicationView["subscriptions"][number] }
  | { type: "key"; app: ApplicationView; key: ApplicationView["keys"][number] }
  | { type: "app"; app: ApplicationView };

const inputClassName = "h-10 w-full rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-[11px] text-[var(--ink)] shadow-[var(--shadow-inset)] outline-none transition placeholder:text-[var(--muted-soft)] hover:border-[var(--line-strong)] focus:border-[var(--brand)] focus:ring-3 focus:ring-[var(--focus-soft)]";

export function AppsManager({ initialApps, products, context = "developer" }: { initialApps: ApplicationView[]; products: CatalogProduct[]; context?: "developer" | "admin" }) {
  const [apps, setApps] = useState(initialApps);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionApp, setActionApp] = useState<ApplicationView | null>(null);
  const [action, setAction] = useState<"key" | "subscribe" | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [confirmError, setConfirmError] = useState("");

  function replace(next: ApplicationView) {
    setApps((items) => items.map((item) => item.id === next.id ? next : item));
    setActionApp((current) => current?.id === next.id ? next : current);
  }

  function closeAction() {
    if (saving) return;
    setAction(null);
    setActionApp(null);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), environment: form.get("environment") }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message);
        return;
      }
      setApps((items) => [result.data.app, ...items]);
      setSecret(result.data.secret);
      setCreateOpen(false);
    } catch {
      setError("无法连接应用服务");
    } finally {
      setSaving(false);
    }
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionApp) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const environment = actionApp.environment === "PRODUCTION" ? "live" : "test";
    try {
      const response = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: actionApp.id, name: form.get("name"), environment, scopes: [] }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message);
        return;
      }
      replace({
        ...actionApp,
        keys: [{ id: result.data.id, name: result.data.name, prefix: result.data.prefix, status: "ACTIVE", lastUsedAt: null, createdAt: result.data.createdAt }, ...actionApp.keys],
      });
      closeAction();
      setSecret(result.data.secret);
    } catch {
      setError("无法创建密钥");
    } finally {
      setSaving(false);
    }
  }

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actionApp) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: actionApp.id, productId: form.get("productId") }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message);
        return;
      }
      replace(result.data);
      setAction(null);
      setActionApp(null);
    } catch {
      setError("无法连接订阅服务");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(app: ApplicationView) {
    const status = app.status === "active" ? "paused" : "active";
    const response = await fetch("/api/v1/apps", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: app.id, status }) });
    const result = await response.json();
    if (!response.ok) {
      setError(result.message);
      return;
    }
    replace(result.data);
  }

  function requestConfirmation(target: ConfirmTarget) {
    setConfirmError("");
    setConfirmTarget(target);
  }

  async function executeConfirmation() {
    if (!confirmTarget) return;
    setConfirming(true);
    setConfirmError("");
    setError("");
    try {
      if (confirmTarget.type === "subscription") {
        const response = await fetch(`/api/v1/subscriptions?id=${encodeURIComponent(confirmTarget.subscription.id)}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) {
          setConfirmError(result.message ?? "无法取消订阅");
          return;
        }
        replace(result.data);
      } else if (confirmTarget.type === "key") {
        const response = await fetch("/api/v1/keys", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: confirmTarget.key.id }) });
        const result = await response.json();
        if (!response.ok) {
          setConfirmError(result.message ?? "无法撤销密钥");
          return;
        }
        replace({ ...confirmTarget.app, keys: confirmTarget.app.keys.map((key) => key.id === confirmTarget.key.id ? { ...key, status: "REVOKED" } : key) });
      } else {
        const response = await fetch(`/api/v1/apps?id=${encodeURIComponent(confirmTarget.app.id)}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) {
          setConfirmError(result.message ?? "无法删除应用");
          return;
        }
        setApps((items) => items.filter((item) => item.id !== confirmTarget.app.id));
      }
      setConfirmTarget(null);
    } catch {
      setConfirmError("操作失败，请检查网络后重试");
    } finally {
      setConfirming(false);
    }
  }

  async function copySecret() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const confirmation = confirmTarget ? confirmationCopy(confirmTarget) : null;

  return <div className="mx-auto max-w-[1440px] space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow">{context === "admin" ? "ADMIN API TESTING" : "APPLICATIONS"}</p>
        <h2 className="mt-1 text-xl font-bold">{context === "admin" ? "API 调试与凭证" : "应用与 API 密钥"}</h2>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{context === "admin" ? "创建管理员测试应用，生成真实 API Key，并按正式订阅、限流与计费链路验证接口。" : "应用隔离密钥、订阅、配额、计费和调用日志。"}</p>
      </div>
      <Button size="sm" onClick={() => { setCreateOpen(true); setError(""); }}><Plus />{context === "admin" ? "创建测试应用" : "创建应用"}</Button>
    </div>

    {error && !action && !createOpen && <FormError>{error}</FormError>}

    <div className="grid gap-4 xl:grid-cols-2">
      {apps.map((app) => <article key={app.id} className="panel overflow-hidden">
        <div className="flex items-start justify-between border-b border-[var(--line)] p-5">
          <div className="flex gap-3">
            <span className="grid size-9 place-items-center rounded-[var(--radius-control)] bg-[var(--brand-soft)]"><KeyRound className="size-4 text-[var(--brand)]" /></span>
            <div>
              <h3 className="text-[12px] font-bold">{app.name}</h3>
              <p className="mt-1 text-[9px] text-[var(--muted)]">{app.environment === "PRODUCTION" ? "生产环境" : "测试环境"} · {app.calls.toLocaleString("zh-CN")} 次调用 · ¥{app.cost}</p>
            </div>
          </div>
          <span className={`rounded-[var(--radius-sm)] px-2 py-1 text-[8px] ${app.status === "active" ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-[var(--warning-soft)] text-[var(--warning)]"}`}>{app.status === "active" ? "运行中" : "已暂停"}</span>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <section>
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold">API 密钥</h4>
              <Button variant="ghost" size="sm" className="h-10 px-3 text-[10px] text-[var(--brand)] sm:h-9" onClick={() => { setActionApp(app); setAction("key"); setError(""); }}>新增密钥</Button>
            </div>
            <div className="mt-2 space-y-2">
              {app.keys.map((key) => <div key={key.id} className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-subtle)] p-2.5">
                <div className="min-w-0 flex-1"><strong className="block truncate text-[9px]">{key.name}</strong><code className="mono text-[8px] text-[var(--muted)]">{key.prefix}••••••••</code></div>
                <span className="text-[8px] text-[var(--muted)]">{key.status === "ACTIVE" ? "有效" : "已撤销"}</span>
                {key.status === "ACTIVE" && <Button variant="ghost" size="icon-sm" className="text-[var(--danger)]" onClick={() => requestConfirmation({ type: "key", app, key })} aria-label={`撤销密钥 ${key.name}`}><ShieldX /></Button>}
              </div>)}
              {!app.keys.length && <p className="py-3 text-[9px] text-[var(--muted)]">暂无密钥</p>}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold">API 订阅</h4>
              <Button variant="ghost" size="sm" className="h-10 px-3 text-[10px] text-[var(--brand)] sm:h-9" onClick={() => { setActionApp(app); setAction("subscribe"); setError(""); }}>订阅 API</Button>
            </div>
            <div className="mt-2 space-y-2">
              {app.subscriptions.filter((item) => item.status === "ACTIVE").map((item) => <div key={item.id} className="flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--surface-subtle)] p-2.5">
                <div className="min-w-0 flex-1"><strong className="block truncate text-[9px]">{item.productName}</strong><span className="mt-0.5 block text-[8px] leading-4 text-[var(--muted)]">{item.qpsLimit} QPS · {BigInt(item.quotaMonthly) > BigInt(0) ? `本月配额 ${BigInt(item.quotaMonthly).toLocaleString("zh-CN")} 次` : "月配额不限"}<br />¥{item.unitPrice}/次</span></div>
                <Button variant="ghost" size="sm" className="h-10 px-3 text-[10px] text-[var(--danger)] sm:h-9" onClick={() => requestConfirmation({ type: "subscription", app, subscription: item })}><Trash2 />取消</Button>
              </div>)}
              {!app.subscriptions.some((item) => item.status === "ACTIVE") && <p className="py-3 text-[9px] text-[var(--muted)]">尚未订阅 API</p>}
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-3">
          <Button variant="secondary" size="sm" className="h-10 sm:h-9" onClick={() => toggle(app)}>{app.status === "active" ? <Pause /> : <Play />}{app.status === "active" ? "暂停" : "恢复"}</Button>
          <Button variant="secondary" size="icon-sm" className="text-[var(--danger)]" onClick={() => requestConfirmation({ type: "app", app })} aria-label={`删除应用 ${app.name}`}><Trash2 /></Button>
        </div>
      </article>)}
    </div>

    {!apps.length && <div className="rounded-[var(--radius-panel)] border border-dashed border-[var(--line-strong)] py-16 text-center"><KeyRound className="mx-auto size-7 text-[var(--muted)]" /><p className="mt-3 text-[12px] font-semibold">暂无应用</p><p className="mt-1 text-[10px] text-[var(--muted)]">创建应用后才能生成密钥和订阅 API。</p></div>}

    {createOpen && <Modal title="创建应用" description="应用用于隔离 API 密钥、订阅和调用统计。" close={() => { if (!saving) setCreateOpen(false); }}>
      <form onSubmit={create} className="space-y-4">
        <Field label="应用名称"><input name="name" required minLength={2} className={inputClassName} aria-label="应用名称" /></Field>
        <Field label="运行环境"><Select name="environment" defaultValue="TEST"><SelectTrigger aria-label="运行环境"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TEST">测试环境</SelectItem><SelectItem value="PRODUCTION">生产环境</SelectItem></SelectContent></Select></Field>
        {error && <FormError>{error}</FormError>}
        <Submit saving={saving} label="创建并生成密钥" />
      </form>
    </Modal>}

    {action === "key" && actionApp && <Modal title={`为 ${actionApp.name} 新增密钥`} description="密钥仅在创建成功后展示一次，请及时妥善保存。" close={closeAction}>
      <form onSubmit={createKey} className="space-y-4">
        <Field label="密钥名称"><input name="name" required minLength={2} className={inputClassName} aria-label="密钥名称" /></Field>
        {error && <FormError>{error}</FormError>}
        <Submit saving={saving} label="生成密钥" />
      </form>
    </Modal>}

    {action === "subscribe" && actionApp && <Modal title={`为 ${actionApp.name} 订阅 API`} description="选择已发布的 API，订阅后即可使用该应用的有效密钥调用。" close={closeAction}>
      <SubscribeForm app={actionApp} products={products} saving={saving} error={error} onSubmit={subscribe} />
    </Modal>}

    {secret && <Modal title="密钥仅显示一次" description="关闭弹窗后无法再次查看完整密钥。" close={() => setSecret("")}>
      <div className="rounded-[var(--radius-control)] border border-[var(--warning)] bg-[var(--warning-soft)] p-3"><code className="mono break-all text-[10px]">{secret}</code></div>
      <Button onClick={copySecret} className="mt-4 w-full">{copied ? <Check /> : <Copy />}{copied ? "已复制" : "复制密钥"}</Button>
    </Modal>}

    {confirmation && <ConfirmDialog open={Boolean(confirmTarget)} title={confirmation.title} description={confirmation.description} detail={confirmation.detail} confirmLabel={confirmation.action} busy={confirming} error={confirmError} onOpenChange={(open) => { if (!open) { setConfirmTarget(null); setConfirmError(""); } }} onConfirm={executeConfirmation} />}
  </div>;
}

function SubscribeForm({ app, products, saving, error, onSubmit }: { app: ApplicationView; products: CatalogProduct[]; saving: boolean; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void> }) {
  const availableProducts = products.filter((product) => !app.subscriptions.some((item) => item.productId === product.id && item.status === "ACTIVE"));
  const defaultProductId = availableProducts[0]?.id;

  return <form onSubmit={onSubmit} className="space-y-4">
    <Field label="已发布 API">
      <Select name="productId" defaultValue={defaultProductId} required disabled={!availableProducts.length}>
        <SelectTrigger aria-label="选择要订阅的 API"><SelectValue placeholder="选择一个 API" /></SelectTrigger>
        <SelectContent><SelectGroup><SelectLabel>可订阅 API</SelectLabel>{availableProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · {product.price}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </Field>
    {!availableProducts.length && <div className="rounded-[var(--radius-control)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-subtle)] px-4 py-6 text-center"><Check className="mx-auto size-5 text-[var(--brand)]" /><p className="mt-2 text-[10px] font-semibold">已订阅全部可用 API</p><p className="mt-1 text-[9px] text-[var(--muted)]">新 API 发布后会在这里出现。</p></div>}
    {error && <FormError>{error}</FormError>}
    <Submit saving={saving} disabled={!availableProducts.length} label="确认订阅" />
  </form>;
}

function confirmationCopy(target: ConfirmTarget) {
  if (target.type === "subscription") return {
    title: `取消订阅 ${target.subscription.productName}？`,
    description: `此操作仅影响应用“${target.app.name}”。`,
    detail: "取消后该应用的密钥将无法继续调用此 API，历史调用与账单记录会保留。需要时可以重新订阅。",
    action: "确认取消",
  };
  if (target.type === "key") return {
    title: `撤销密钥 ${target.key.name}？`,
    description: `此操作将立即使该密钥失效。`,
    detail: "已撤销的密钥无法恢复。依赖该密钥的服务会停止调用，之后需要生成并替换新密钥。",
    action: "确认撤销",
  };
  return {
    title: `删除应用 ${target.app.name}？`,
    description: "应用、密钥和订阅关系将一并删除。",
    detail: "该操作不可撤销。删除前请确认线上服务已停用此应用下的全部 API 密钥。",
    action: "确认删除",
  };
}

function Modal({ title, description, close, children }: { title: string; description: string; close: () => void; children: ReactNode }) {
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="max-w-md p-0"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><DialogBody>{children}</DialogBody></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><span className="mb-1.5 block text-[10px] font-semibold text-[var(--ink)]">{label}</span>{children}</div>;
}

function FormError({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-[10px] leading-5 text-[var(--danger)]">{children}</p>;
}

function Submit({ saving, disabled = false, label }: { saving: boolean; disabled?: boolean; label: string }) {
  return <Button disabled={saving || disabled} className="w-full">{saving && <Loader2 className="animate-spin" />}{saving ? "正在处理" : label}</Button>;
}
