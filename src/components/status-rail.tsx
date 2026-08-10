import { CheckCircle2 } from "lucide-react";

export type GatewayStatus = { calls: number; successRate: number | null; averageLatency: number | null };

export function StatusRail({ status }: { status: GatewayStatus }) {
  return <div className="status-rail"><div className="container-shell flex h-7 items-center justify-between gap-4 overflow-hidden text-[9px]"><div className="flex shrink-0 items-center gap-2 font-semibold text-[var(--success)]"><CheckCircle2 className="size-3.5" /><span>平台服务在线</span></div><div className="relative hidden h-px flex-1 overflow-hidden bg-[var(--line)] md:block"><span className="pulse-track absolute -top-px h-[3px] w-1/4 bg-[var(--aqua)]" /></div><div className="flex shrink-0 items-center gap-4 text-[var(--muted)]"><span>近 5 分钟 {status.calls.toLocaleString("zh-CN")} 次请求</span><span className="hidden sm:inline">成功率 {status.successRate == null ? "暂无" : `${status.successRate}%`}</span><span className="hidden lg:inline">平均延迟 {status.averageLatency == null ? "暂无" : `${status.averageLatency} ms`}</span></div></div></div>;
}
