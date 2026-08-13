"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "./button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  detail?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  busy?: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel = "确认删除",
  pendingLabel = "正在处理",
  busy = false,
  error,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen); }}>
    <DialogContent className="max-w-[460px] p-0" showClose={!busy} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <DialogHeader>
        <div className="flex items-start gap-3 pr-5">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--danger-soft)] text-[var(--danger)]"><AlertTriangle className="size-4" /></span>
          <div className="min-w-0"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div>
        </div>
      </DialogHeader>
      {(detail || error) && <DialogBody className="space-y-3">
        {detail && <div className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-subtle)] px-3 py-3 text-[10px] leading-5 text-[var(--muted)]">{detail}</div>}
        {error && <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-soft)] px-3 py-2.5 text-[10px] leading-5 text-[var(--danger)]">{error}</p>}
      </DialogBody>}
      <DialogFooter>
        <Button type="button" variant="secondary" size="sm" className="h-10 sm:h-9" disabled={busy} onClick={() => onOpenChange(false)}>返回</Button>
        <Button type="button" variant="destructive" size="sm" className="h-10 sm:h-9" disabled={busy} onClick={onConfirm}>{busy && <Loader2 className="animate-spin" />}{busy ? pendingLabel : confirmLabel}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
