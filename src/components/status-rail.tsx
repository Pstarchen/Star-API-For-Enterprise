import { CheckCircle2 } from "lucide-react";

export type GatewayStatus = { calls: number; successRate: number | null; averageLatency: number | null };

export function StatusRail({ status }: { status: GatewayStatus }) {
  return <div className="border-b border-white/10 bg-[var(--night)] text-white"><div className="container-shell flex h-8 items-center justify-between gap-4 overflow-hidden text-[10px]"><div className="flex shrink-0 items-center gap-2 text-[#b9d8cd]"><CheckCircle2 className="size-3.5 text-[#51d5a9]" /><span>平台服务在线</span></div><div className="relative hidden h-px flex-1 overflow-hidden bg-white/10 md:block"><span className="pulse-track absolute -top-px h-[3px] w-1/4 bg-[#51d5a9]" /></div><div className="flex shrink-0 items-center gap-4 text-white/55"><span>近 5 分钟 {status.calls.toLocaleString("zh-CN")} 次请求</span><span className="hidden sm:inline">成功率 {status.successRate == null ? "暂无" : `${status.successRate}%`}</span><span className="hidden lg:inline">平均延迟 {status.averageLatency == null ? "暂无" : `${status.averageLatency} ms`}</span></div></div></div>;
}
