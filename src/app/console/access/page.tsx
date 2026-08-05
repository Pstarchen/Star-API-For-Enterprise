import { MoreHorizontal } from "lucide-react";
import { ResourceTablePage } from "@/components/resource-table-page";
const members = [["林知远", "lin.zy@xinghai.cn", "企业管理员", "全部应用", "刚刚", "正常"], ["赵清", "zhao.q@xinghai.cn", "开发者", "2 个应用", "12 分钟前", "正常"], ["陈安", "chen.a@xinghai.cn", "财务管理员", "账单与发票", "昨天", "正常"], ["周可", "zhou.k@xinghai.cn", "只读审计员", "全部资源只读", "3 天前", "正常"]];
export default function AccessPage() { return <ResourceTablePage eyebrow="IDENTITY & ACCESS" title="访问控制" description="通过角色和资源范围实现最小权限，所有变更进入审计日志。" action="邀请成员" columns={["成员", "邮箱", "角色", "资源范围", "最近登录", "状态", "操作"]} rows={members.map((row) => [...row, <MoreHorizontal key="more" className="size-4 text-[var(--muted)]" />])} />; }
