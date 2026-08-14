"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function DocsCopyButton({ command, endpointName, method }: { command: string; endpointName: string; method: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const label = `${copied ? "已复制" : "复制"}${endpointName} ${method} 请求命令`;
  return <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    onClick={copy}
    aria-label={label}
    title={label}
    className="absolute right-3 top-3 border border-white/10 text-[#9eabc5] hover:bg-white/10 hover:text-white"
  >
    {copied ? <Check className="text-[#7dd9b6]" /> : <Copy />}
  </Button>;
}
