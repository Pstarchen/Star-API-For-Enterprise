import { Database } from "lucide-react";
import { Card } from "./ui/card";
import { EmptyState } from "./ui/empty-state";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from "./ui/table";

export function ResourceTablePage({ eyebrow, title, description, columns, rows, emptyText = "暂无真实记录" }: { eyebrow: string; title: string; description: string; columns: string[]; rows: React.ReactNode[][]; emptyText?: string }) {
  return <div className="page-shell space-y-5">
    <div><p className="eyebrow">{eyebrow}</p><h2 className="page-title mt-1">{title}</h2><p className="page-description mt-1">{description}</p></div>
    <Card className="overflow-hidden">
      <TableContainer><Table className="min-w-[760px]"><TableHeader><TableRow className="hover:bg-transparent">{columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, rowIndex) => <TableRow key={rowIndex}>{row.map((cell, cellIndex) => <TableCell key={cellIndex}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>
      {!rows.length && <EmptyState icon={Database} title={emptyText} description="这里会显示数据库中的真实记录。" />}
      <div className="border-t border-[var(--line)] bg-[var(--surface-subtle)] px-5 py-3 text-[9px] text-[var(--muted)]">共 {rows.length} 条真实记录</div>
    </Card>
  </div>;
}
