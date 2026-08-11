"use client";

import { CheckCircle2, FileUp, RotateCcw, UploadCloud } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type FileUploadFieldProps = {
  name: string;
  title: string;
  description: string;
  accept: string;
  required?: boolean;
  multiple?: boolean;
  maxBytes?: number;
  icon?: ReactNode;
  className?: string;
  onFilesChange?: (files: File[]) => void;
};

export function FileUploadField({ name, title, description, accept, required = false, multiple = false, maxBytes, icon, className, onFilesChange }: FileUploadFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const selected = files.length > 0;
  const selectedSummary = selected ? fileSummary(files) : description;

  function update(next: File[]) {
    if (maxBytes && next.some((file) => file.size > maxBytes)) {
      setError(`单个文件不能超过 ${formatBytes(maxBytes)}`);
      if (inputRef.current) inputRef.current.value = "";
      setFiles([]);
      onFilesChange?.([]);
      return;
    }
    setError("");
    setFiles(next);
    onFilesChange?.(next);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    update([]);
  }

  return <div className={cn("file-upload-field", selected && "is-selected", className)}>
    <input ref={inputRef} id={id} name={name} required={required} type="file" accept={accept} multiple={multiple} onChange={(event) => update(Array.from(event.target.files ?? []))} className="sr-only" />
    <label htmlFor={id} className="file-upload-target">
      <span className="file-upload-icon">{selected ? <CheckCircle2 /> : icon ?? <UploadCloud />}</span>
      <span className="min-w-0 flex-1 text-left">
        <strong>{selected ? multiple ? `${files.length} 个文件已就绪` : files[0].name : title}</strong>
        <small>{selectedSummary}</small>
      </span>
      <span className="file-upload-action">{selected ? <><FileUp />重新选择</> : <><UploadCloud />选择文件</>}</span>
    </label>
    {selected && <button type="button" onClick={clear} className="file-upload-reset"><RotateCcw />清除</button>}
    <span className="sr-only" aria-live="polite">{selected ? `已选择 ${files.length} 个文件` : "尚未选择文件"}</span>
    {error && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
  </div>;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fileSummary(files: File[]) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (files.length === 1) return `${files[0].name} · ${formatBytes(total)}`;
  const names = files.slice(0, 3).map((file) => file.name).join("，");
  return `${names}${files.length > 3 ? ` 等 ${files.length} 个文件` : ""} · 共 ${formatBytes(total)}`;
}
