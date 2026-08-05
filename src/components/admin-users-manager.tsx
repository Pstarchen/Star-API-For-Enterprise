"use client";

import { Building2, Download, Search, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { platformUsers } from "@/lib/data";
import type { AccountType, PlatformUser } from "@/lib/types";

type UserStatusFilter = "全部状态" | PlatformUser["status"];
type UserTypeFilter = "全部用户" | AccountType;

export function AdminUsersManager() {
  const [users, setUsers] = useState(platformUsers);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<UserTypeFilter>("全部用户");
  const [status, setStatus] = useState<UserStatusFilter>("全部状态");
  const [notice, setNotice] = useState("");

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !keyword || [user.name, user.email, user.workspace, user.id].some((value) => value.toLowerCase().includes(keyword));
      return matchesQuery && (type === "全部用户" || user.accountType === type) && (status === "全部状态" || user.status === status);
    });
  }, [query, status, type, users]);

  const personalCount = users.filter((user) => user.accountType === "个人").length;
  const enterpriseCount = users.filter((user) => user.accountType === "企业").length;

  function setUserStatus(id: string, nextStatus: PlatformUser["status"]) {
    const target = users.find((user) => user.id === id);
    setUsers((current) => current.map((user) => user.id === id ? { ...user, status: nextStatus } : user));
    setNotice(`${target?.name ?? "用户"}的状态已更新为${nextStatus}`);
  }

  function exportUsers() {
    const rows = filteredUsers.map((user) => [user.id, user.name, user.email, user.accountType, user.plan, user.workspace, user.calls, user.balance, user.status, user.joinedAt]);
    const csv = ["用户ID,姓名,邮箱,账户类型,套餐,工作空间,调用量,余额,状态,注册日期", ...rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "star-api-users.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="mx-auto max-w-[1440px] space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">USER OPERATIONS</p><h2 className="mt-1 text-xl font-bold">用户与账户管理</h2><p className="mt-1 text-[11px] text-[var(--muted)]">统一管理个人开发者、企业成员、订阅套餐与账户状态。</p></div><button onClick={exportUsers} className="inline-flex h-9 items-center justify-center gap-2 rounded-[4px] border border-[var(--line-strong)] bg-white px-4 text-[10px] font-semibold"><Download className="size-3.5" /> 导出当前结果</button></div>

    <div className="grid gap-3 sm:grid-cols-3">
      <Summary label="平台用户" value={users.length.toString()} detail="已注册账户" icon={UserRound} />
      <Summary label="个人开发者" value={personalCount.toString()} detail="独立空间与按量消费" icon={ShieldCheck} />
      <Summary label="企业用户" value={enterpriseCount.toString()} detail="组织、成员与权限治理" icon={Building2} />
    </div>

    {notice && <div role="status" className="rounded-[4px] border border-[#c8e2d8] bg-[var(--brand-soft)] px-3 py-2.5 text-[10px] text-[var(--brand-strong)]">{notice}</div>}

    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-[var(--line)] p-4 lg:flex-row">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 border border-[var(--line)] px-3 lg:max-w-sm"><Search className="size-3.5 text-[var(--muted)]" /><span className="sr-only">搜索用户</span><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 text-[10px] outline-none" placeholder="姓名、邮箱、工作空间或用户 ID" /></label>
        <label><span className="sr-only">账户类型</span><select value={type} onChange={(event) => setType(event.target.value as UserTypeFilter)} className="h-9 w-full border border-[var(--line)] bg-white px-3 text-[10px] lg:w-32"><option>全部用户</option><option>个人</option><option>企业</option></select></label>
        <label><span className="sr-only">账户状态</span><select value={status} onChange={(event) => setStatus(event.target.value as UserStatusFilter)} className="h-9 w-full border border-[var(--line)] bg-white px-3 text-[10px] lg:w-32"><option>全部状态</option><option>正常</option><option>待认证</option><option>已冻结</option></select></label>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-[10px]"><thead className="bg-[var(--surface-subtle)] text-[var(--muted)]"><tr><th className="px-4 py-3 font-medium">用户</th><th className="px-4 py-3 font-medium">类型 / 套餐</th><th className="px-4 py-3 font-medium">工作空间</th><th className="px-4 py-3 font-medium">本月调用</th><th className="px-4 py-3 font-medium">账户余额</th><th className="px-4 py-3 font-medium">状态</th><th className="px-4 py-3 font-medium">注册日期</th><th className="px-4 py-3 font-medium">账户操作</th></tr></thead>
        <tbody className="divide-y divide-[var(--line)]">{filteredUsers.map((user) => <tr key={user.id} className="hover:bg-[var(--surface-subtle)]"><td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${user.accountType === "企业" ? "bg-[var(--brand-soft)] text-[var(--brand-strong)]" : "bg-[#e8eef7] text-[#285c9f]"}`}>{user.name.slice(0, 1)}</span><span><strong className="block">{user.name}</strong><small className="mt-0.5 block text-[8px] text-[var(--muted)]">{user.email} · {user.id}</small></span></div></td><td className="px-4 py-3"><span className="block font-semibold">{user.accountType}</span><small className="text-[8px] text-[var(--muted)]">{user.plan}</small></td><td className="px-4 py-3">{user.workspace}</td><td className="px-4 py-3 font-semibold">{user.calls}</td><td className="px-4 py-3">{user.balance}</td><td className="px-4 py-3"><StatusBadge status={user.status} /></td><td className="mono px-4 py-3 text-[9px] text-[var(--muted)]">{user.joinedAt}</td><td className="px-4 py-3"><label><span className="sr-only">更新{user.name}的状态</span><select value={user.status} onChange={(event) => setUserStatus(user.id, event.target.value as PlatformUser["status"])} className="h-8 border border-[var(--line)] bg-white px-2 text-[9px]"><option>正常</option><option>待认证</option><option>已冻结</option></select></label></td></tr>)}</tbody>
      </table></div>
      <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 text-[9px] text-[var(--muted)]"><span>显示 {filteredUsers.length} / {users.length} 个用户</span><span>状态变更将写入平台审计日志</span></div>
    </section>
  </div>;
}

function Summary({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof UserRound }) {
  return <section className="panel flex items-center justify-between p-4"><div><p className="text-[9px] text-[var(--muted)]">{label}</p><strong className="mt-1 block text-xl">{value}</strong><p className="mt-1 text-[8px] text-[var(--muted)]">{detail}</p></div><span className="grid size-9 place-items-center rounded-[4px] bg-[var(--surface-subtle)]"><Icon className="size-4 text-[var(--brand)]" /></span></section>;
}

function StatusBadge({ status }: { status: PlatformUser["status"] }) {
  const tone = status === "正常" ? "bg-[var(--brand-soft)] text-[var(--brand-strong)]" : status === "已冻结" ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--warning-soft)] text-[#784707]";
  return <span className={`inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 text-[9px] ${tone}`}><span className="size-1.5 rounded-full bg-current" />{status}</span>;
}
