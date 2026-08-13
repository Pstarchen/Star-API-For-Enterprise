"use client";

import { useMemo, useState } from "react";
import {
  directChannelValue,
  epayPaymentTypeNames,
  paymentChannelNames,
  type DirectPaymentChannelKey,
  type EpayPaymentType,
  type PaymentChannelValue,
  type PaymentProviderOption,
} from "@/lib/payment-options";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export type DirectPaymentChannel = {
  key: DirectPaymentChannelKey;
  enabled: boolean;
  configured: boolean;
  publicConfig?: Record<string, unknown>;
};

export function PaymentMethodSelector({ channels, paymentProviders }: { channels: readonly DirectPaymentChannel[]; paymentProviders: readonly PaymentProviderOption[] }) {
  const directChannels = useMemo(() => channels.filter((item) => item.enabled && item.configured), [channels]);
  const initialChannel: PaymentChannelValue = directChannels[0] ? directChannelValue(directChannels[0].key) : "EPAY";
  const [channel, setChannel] = useState<PaymentChannelValue>(initialChannel);
  const [providerId, setProviderId] = useState(paymentProviders[0]?.id ?? "");
  const provider = paymentProviders.find((item) => item.id === providerId) ?? paymentProviders[0];
  const [paymentType, setPaymentType] = useState<EpayPaymentType>(provider?.paymentTypes[0] ?? "alipay");

  function selectProvider(id: string) {
    setProviderId(id);
    const next = paymentProviders.find((item) => item.id === id);
    if (next && !next.paymentTypes.includes(paymentType)) setPaymentType(next.paymentTypes[0] ?? "alipay");
  }

  return <div className="space-y-4">
    <Field label="支付渠道">
      <Select name="channel" value={channel} onValueChange={(value) => setChannel(value as PaymentChannelValue)}>
        <SelectTrigger><SelectValue placeholder="选择支付渠道" /></SelectTrigger>
        <SelectContent>
          {directChannels.map((item) => { const value = directChannelValue(item.key); return <SelectItem key={item.key} value={value}>{paymentChannelNames[value]}</SelectItem>; })}
          {paymentProviders.length > 0 && <SelectItem value="EPAY">易支付服务商</SelectItem>}
        </SelectContent>
      </Select>
    </Field>
    {channel === "EPAY" && provider && <>
      <Field label="支付服务商">
        <Select name="paymentProviderId" value={provider.id} onValueChange={selectProvider}>
          <SelectTrigger><SelectValue placeholder="选择服务商" /></SelectTrigger>
          <SelectContent>{paymentProviders.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="支付方式">
        <Select name="paymentType" value={paymentType} onValueChange={(value) => setPaymentType(value as EpayPaymentType)}>
          <SelectTrigger><SelectValue placeholder="选择支付方式" /></SelectTrigger>
          <SelectContent>{provider.paymentTypes.map((type) => <SelectItem key={type} value={type}>{epayPaymentTypeNames[type]}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-subtle)] p-3 text-[9px]"><Info label="最低金额" value={`¥${provider.minAmount}`} /><Info label="最高金额" value={`¥${provider.maxAmount}`} /><Info label="渠道费率" value={`${provider.feeRate}%`} /></div>
    </>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-semibold">{label}</span>{children}</label>; }
function Info({ label, value }: { label: string; value: string }) { return <span><small className="block text-[8px] text-[var(--muted)]">{label}</small><strong className="mt-1 block text-[10px]">{value}</strong></span>; }
