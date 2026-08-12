import "server-only";

import { Prisma } from "@prisma/client";
import { after } from "next/server";
import type { EmailEventId, EmailTemplatePlaceholder } from "@/lib/email-templates";
import { sendEventEmail, smtpDeliveryMessage } from "@/lib/server/email";
import { getEmailSettings } from "@/lib/server/email-settings";
import { getPlatformConfig } from "@/lib/server/installation";
import { prisma } from "@/lib/server/prisma";

type DeliveryInput = {
  tenantId: string;
  eventId: EmailEventId;
  dedupeKey: string;
  values: Partial<Record<EmailTemplatePlaceholder, string>>;
  requireNotificationEmail?: boolean;
};

function ownerRecipient(tenant: {
  notificationEmail: string | null;
  name: string;
  memberships: Array<{ role: string; user: { name: string; email: string } }>;
}, requireNotificationEmail: boolean) {
  if (tenant.notificationEmail) return { email: tenant.notificationEmail, name: tenant.name };
  if (requireNotificationEmail) return null;
  const membership = tenant.memberships.find((item) => item.role === "OWNER") ?? tenant.memberships[0];
  return membership ? { email: membership.user.email, name: membership.user.name } : null;
}

async function claimDelivery(input: DeliveryInput, recipientEmail: string) {
  try {
    return await prisma.emailDelivery.create({
      data: { tenantId: input.tenantId, eventId: input.eventId, dedupeKey: input.dedupeKey, recipientEmail },
      select: { id: true },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await prisma.emailDelivery.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true, status: true } });
    if (!existing || existing.status !== "FAILED") return null;
    const claimed = await prisma.emailDelivery.updateMany({
      where: { id: existing.id, status: "FAILED" },
      data: { status: "PENDING", attempts: { increment: 1 }, recipientEmail, lastError: null },
    });
    return claimed.count === 1 ? { id: existing.id } : null;
  }
}

export async function deliverTenantEventEmail(input: DeliveryInput) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      name: true,
      notificationEmail: true,
      memberships: { orderBy: { createdAt: "asc" }, select: { role: true, user: { select: { name: true, email: true } } } },
    },
  });
  if (!tenant) return { status: "SKIPPED" as const, reason: "TENANT_NOT_FOUND" };
  const recipient = ownerRecipient(tenant, input.requireNotificationEmail === true);
  if (!recipient) return { status: "SKIPPED" as const, reason: "RECIPIENT_NOT_CONFIGURED" };
  const delivery = await claimDelivery(input, recipient.email);
  if (!delivery) return { status: "SKIPPED" as const, reason: "ALREADY_DELIVERED_OR_PENDING" };
  try {
    await sendEventEmail(input.eventId, recipient.email, recipient.name, input.values);
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
    return { status: "SENT" as const };
  } catch (error) {
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: smtpDeliveryMessage(error).slice(0, 500) } }).catch(() => undefined);
    return { status: "FAILED" as const };
  }
}

export function queueTenantEventEmail(input: DeliveryInput) {
  after(async () => { await deliverTenantEventEmail(input); });
}

export function queueLowBalanceAlert(input: { tenantId: string; dedupeKey: string; previousBalance: string; currentBalance: string }) {
  after(async () => {
    const [settings, platform, tenant] = await Promise.all([
      getEmailSettings(),
      getPlatformConfig(),
      prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { balanceAlerts: true } }),
    ]);
    if (!settings.alerts.lowBalanceEnabled || !tenant?.balanceAlerts) return;
    const threshold = new Prisma.Decimal(settings.alerts.lowBalanceThreshold);
    const previous = new Prisma.Decimal(input.previousBalance);
    const current = new Prisma.Decimal(input.currentBalance);
    if (previous.lt(threshold) || current.gte(threshold)) return;
    const publicUrl = platform.publicUrl.replace(/\/$/, "");
    await deliverTenantEventEmail({
      tenantId: input.tenantId,
      eventId: "low-balance",
      dedupeKey: `low-balance:${input.dedupeKey}`,
      requireNotificationEmail: true,
      values: {
        current_balance: current.toFixed(6).replace(/\.?0+$/, ""),
        threshold: threshold.toFixed(6).replace(/\.?0+$/, ""),
        recharge_url: settings.alerts.rechargeUrl || `${publicUrl}/console/billing`,
        unsubscribe_url: `${publicUrl}/console/settings`,
      },
    });
  });
}

export function queueQuotaAlert(input: { tenantId: string; subscriptionId: string; appId: string; appName: string; usedBefore: bigint; usedAfter: bigint; quota: bigint; period: string }) {
  if (input.quota <= BigInt(0)) return;
  after(async () => {
    const [settings, tenant] = await Promise.all([
      getEmailSettings(),
      prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { quotaAlerts: true } }),
    ]);
    if (!settings.alerts.quotaAlertEnabled || !tenant?.quotaAlerts) return;
    const threshold = (input.quota * BigInt(settings.alerts.quotaThresholdPercent) + BigInt(99)) / BigInt(100);
    if (input.usedBefore >= threshold || input.usedAfter < threshold) return;
    await deliverTenantEventEmail({
      tenantId: input.tenantId,
      eventId: "account-quota-alert",
      dedupeKey: `account-quota-alert:${input.subscriptionId}:${input.period}`,
      requireNotificationEmail: true,
      values: {
        account_id: input.appId,
        account_name: input.appName,
        quota_dimension: "月调用次数",
        quota_used: input.usedAfter.toLocaleString("en-US"),
        quota_limit: input.quota.toLocaleString("en-US"),
        quota_remaining: (input.quota > input.usedAfter ? input.quota - input.usedAfter : BigInt(0)).toLocaleString("en-US"),
        quota_threshold: `${settings.alerts.quotaThresholdPercent}%`,
      },
    });
  });
}
