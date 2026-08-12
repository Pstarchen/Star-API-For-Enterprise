"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "./button";
import { Input, InputGroup } from "./input";
import { cn } from "@/lib/utils";

export function PasswordField({ label, className, inputClassName, ...props }: Omit<React.ComponentProps<typeof Input>, "type" | "id"> & { label: string; className?: string; inputClassName?: string }) {
  const id = React.useId();
  const [revealed, setRevealed] = React.useState(false);
  return <div className={cn("space-y-1.5", className)}>
    <label htmlFor={id} className="block text-[13px] font-semibold text-[var(--ink)]">{label}</label>
    <InputGroup className="h-11">
      <Input id={id} type={revealed ? "text" : "password"} className={cn("text-[12px]", inputClassName)} {...props} />
      <Button type="button" variant="ghost" size="icon" onClick={() => setRevealed((value) => !value)} className="mr-0.5 size-10 shrink-0" aria-controls={id} aria-pressed={revealed} aria-label={revealed ? "隐藏输入内容" : "显示输入内容"} title={revealed ? `隐藏${label}` : `显示${label}`}>{revealed ? <EyeOff /> : <Eye />}</Button>
    </InputGroup>
  </div>;
}
