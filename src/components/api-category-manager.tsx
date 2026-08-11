"use client";

import { CheckCircle2, FolderPlus, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { ApiCategoryOption } from "@/lib/catalog";
import { Button } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";

const inputClass = "h-9 w-full rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 text-[10px] outline-none focus:border-[var(--brand)]";

export function ApiCategoryManager({ categories, close, changed }: { categories: ApiCategoryOption[]; close: () => void; changed: (categories: ApiCategoryOption[]) => void }) {
  const [items, setItems] = useState(categories);
  const [editing, setEditing] = useState<ApiCategoryOption | null>(null);
  const [deleting, setDeleting] = useState<ApiCategoryOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function apply(next: ApiCategoryOption[]) {
    setItems(next);
    changed(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = { ...(editing ? { id: editing.id } : {}), name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), sortOrder: Number(form.get("sortOrder") ?? 0), enabled: form.get("enabled") === "on" };
    try {
      const response = await fetch("/api/v1/admin/api-categories", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "分类保存失败"); return; }
      const next = editing ? result.data as ApiCategoryOption[] : [...items, result.data as ApiCategoryOption].sort(categorySort);
      apply(next);
      setEditing(null);
      setNotice(editing ? "分类已更新" : "分类已创建");
      event.currentTarget.reset();
    } catch { setError("无法连接分类管理服务"); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!deleting) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/admin/api-categories?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "分类删除失败"); return; }
      apply(items.filter((item) => item.id !== deleting.id));
      setDeleting(null);
      setNotice(result.message);
    } catch { setError("无法连接分类管理服务"); }
    finally { setSaving(false); }
  }

  return <>
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="w-[min(calc(100%-24px),840px)] p-0" showClose={false}>
      <DialogHeader><DialogTitle>API 分类管理</DialogTitle><DialogDescription>分类会同步用于 API 创建、编辑、OpenAPI 导入和市场筛选。</DialogDescription></DialogHeader>
      <DialogBody className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="overflow-hidden rounded-[8px] border border-[var(--line)]">
          <div className="grid grid-cols-[1fr_72px_64px] bg-[var(--surface-subtle)] px-3 py-2 text-[9px] font-semibold text-[var(--muted)]"><span>分类</span><span>API 数量</span><span className="text-right">操作</span></div>
          <div className="max-h-[420px] divide-y divide-[var(--line)] overflow-y-auto">{items.map((item) => <div key={item.id} className="grid min-h-16 grid-cols-[1fr_72px_64px] items-center gap-2 px-3 py-2.5">
            <span className="min-w-0"><strong className="flex items-center gap-2 truncate text-[10px]">{item.name}{!item.enabled && <small className="rounded-full bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[7px] font-medium text-[var(--muted)]">停用</small>}</strong><small className="mt-1 block truncate text-[8px] text-[var(--muted)]">{item.description || "暂无说明"}</small></span>
            <span className="text-[10px] text-[var(--muted)]">{item.productCount}</span>
            <span className="flex justify-end"><Button type="button" variant="ghost" size="icon-sm" onClick={() => { setEditing(item); setError(""); }} aria-label={`编辑 ${item.name}`}><Pencil /></Button><Button type="button" variant="ghost" size="icon-sm" onClick={() => setDeleting(item)} disabled={item.productCount > 0} className="text-[var(--danger)]" aria-label={`删除 ${item.name}`}><Trash2 /></Button></span>
          </div>)}{!items.length && <div className="grid min-h-40 place-items-center text-center"><span><FolderPlus className="mx-auto size-6 text-[var(--muted)]" /><small className="mt-2 block text-[9px] text-[var(--muted)]">还没有 API 分类</small></span></div>}</div>
        </div>
        <form key={editing?.id ?? "create"} onSubmit={submit} className="space-y-4 rounded-[8px] border border-[var(--line)] bg-[var(--surface-subtle)] p-4">
          <div><strong className="text-[11px]">{editing ? "编辑分类" : "添加分类"}</strong><p className="mt-1 text-[8px] leading-4 text-[var(--muted)]">排序值越小越靠前；停用后不能再分配给 API。</p></div>
          <label className="block"><span className="mb-1.5 block text-[9px] font-semibold">分类名称</span><Input name="name" required maxLength={24} defaultValue={editing?.name} /></label>
          <label className="block"><span className="mb-1.5 block text-[9px] font-semibold">分类说明</span><textarea name="description" maxLength={120} rows={3} defaultValue={editing?.description} className="w-full resize-none rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[10px] leading-5 outline-none focus:border-[var(--brand)]" /></label>
          <label className="block"><span className="mb-1.5 block text-[9px] font-semibold">排序值</span><input name="sortOrder" type="number" min="0" max="10000" defaultValue={editing?.sortOrder ?? 100} className={inputClass} /></label>
          <label className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[9px] font-semibold"><span>允许分配</span><Switch name="enabled" defaultChecked={editing?.enabled ?? true} aria-label="允许分配此分类" /></label>
          <div className="flex gap-2"><Button disabled={saving} size="sm" className="flex-1">{saving ? <Loader2 className="animate-spin" /> : editing ? <Save /> : <Plus />}{editing ? "保存" : "添加"}</Button>{editing && <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(null)}>取消</Button>}</div>
        </form>
        {(error || notice) && <p role={error ? "alert" : "status"} className={`lg:col-span-2 flex items-center gap-2 rounded-[8px] px-3 py-2.5 text-[9px] ${error ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--success-soft)] text-[var(--success)]"}`}>{!error && <CheckCircle2 className="size-3.5" />}{error || notice}</p>}
      </DialogBody>
      <DialogFooter><Button type="button" onClick={close} variant="secondary" size="sm">完成</Button></DialogFooter>
    </DialogContent></Dialog>
    {deleting && <Dialog open onOpenChange={(open) => { if (!open) setDeleting(null); }}><DialogContent className="w-[min(calc(100%-24px),440px)] p-0" showClose={false}><DialogHeader><DialogTitle>删除分类</DialogTitle><DialogDescription>确认删除“{deleting.name}”？该操作不可撤销。</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="secondary" size="sm" onClick={() => setDeleting(null)}>取消</Button><Button type="button" variant="destructive" size="sm" onClick={remove} disabled={saving}>{saving && <Loader2 className="animate-spin" />}确认删除</Button></DialogFooter></DialogContent></Dialog>}
  </>;
}

function categorySort(left: ApiCategoryOption, right: ApiCategoryOption) {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN");
}
