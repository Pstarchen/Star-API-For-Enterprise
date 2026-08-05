import { CheckCircle2 } from "lucide-react";

const nodes = [
  { name: "北京", latency: "18ms" },
  { name: "上海", latency: "21ms" },
  { name: "广州", latency: "25ms" },
  { name: "成都", latency: "31ms" },
];

export function StatusRail() {
  return (
    <div className="border-b border-white/10 bg-[var(--night)] text-white">
      <div className="container-shell flex h-8 items-center justify-between gap-4 overflow-hidden text-[11px]">
        <div className="flex shrink-0 items-center gap-2 text-[#b9d8cd]">
          <CheckCircle2 className="size-3.5 text-[#51d5a9]" />
          <span>全部服务运行正常</span>
          <span className="hidden text-white/40 sm:inline">99.99% 可用性</span>
        </div>
        <div className="relative hidden h-px flex-1 overflow-hidden bg-white/10 md:block">
          <span className="pulse-track absolute -top-px h-[3px] w-1/4 bg-[#51d5a9]" />
        </div>
        <div className="hidden shrink-0 items-center gap-5 lg:flex">
          {nodes.map((node) => (
            <span key={node.name} className="text-white/55">
              {node.name} <strong className="mono ml-1 font-medium text-[#a9e8d2]">{node.latency}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
