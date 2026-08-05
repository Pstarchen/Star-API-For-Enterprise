import { MoreHorizontal } from "lucide-react";
import { ResourceTablePage } from "@/components/resource-table-page";
const data = [["星海科技集团", "企业版", "86", "628.4 万", "¥ 12,684", "正常"], ["华东供应链有限公司", "专业版", "28", "186.2 万", "¥ 4,208", "正常"], ["明辰金融科技", "企业版", "142", "982.6 万", "¥ 28,640", "正常"], ["云港信息服务", "基础版", "12", "42.8 万", "¥ 986", "观察中"], ["远山电子商务", "专业版", "36", "215.4 万", "¥ 6,342", "正常"]];
export default function TenantsPage() { return <ResourceTablePage eyebrow="TENANTS" title="企业租户" description="管理企业实名、套餐、成员规模、消费与风险状态。" action="创建租户" columns={["企业", "套餐", "成员", "本月调用", "本月消费", "状态", "操作"]} rows={data.map((row) => [...row, <MoreHorizontal key="more" className="size-4 text-[var(--muted)]" />])} />; }
