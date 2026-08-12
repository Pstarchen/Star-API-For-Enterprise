export const EMAIL_VERIFICATION_EXPIRES_MINUTES = 10;
export const PASSWORD_RESET_EXPIRES_MINUTES = 30;

export const emailEventIds = [
  "email-verification",
  "password-reset",
  "notification-email-verification",
  "low-balance",
  "recharge-success",
  "account-quota-alert",
] as const;

export type EmailEventId = (typeof emailEventIds)[number];

export const emailTemplatePlaceholders = [
  "site_name", "recipient_name", "recipient_email", "verification_code", "expires_in_minutes", "reset_url",
  "current_balance", "threshold", "recharge_url", "unsubscribe_url", "recharge_amount", "order_id",
  "account_id", "account_name", "platform", "quota_dimension", "quota_used", "quota_limit", "quota_remaining", "quota_threshold",
] as const;

export type EmailTemplatePlaceholder = (typeof emailTemplatePlaceholders)[number];
export type EmailTemplate = { subject: string; html: string };

const shell = (title: string, color: string, content: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 24px; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #18181b; }
    .container { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.10); }
    .header { background: ${color}; color: #ffffff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 24px; line-height: 1.25; }
    .content { padding: 32px; font-size: 15px; line-height: 1.7; }
    .button { display: inline-block; margin-top: 12px; padding: 11px 18px; border-radius: 8px; background: ${color}; color: #ffffff; text-decoration: none; font-weight: 600; }
    .muted { color: #71717a; font-size: 13px; }
    .footer { padding: 18px 32px; background: #fafafa; color: #a1a1aa; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${title}</h1></div>
    <div class="content">
${content}</div>
    <div class="footer">This email was sent by {{site_name}}. Please do not reply directly.</div>
  </div>
</body>
</html>`;

export const emailEventDefinitions: Record<EmailEventId, {
  label: string;
  description: string;
  placeholders: EmailTemplatePlaceholder[];
  official: EmailTemplate;
}> = {
  "email-verification": {
    label: "邮箱验证码",
    description: "注册、登录前邮箱验证等认证安全场景。",
    placeholders: ["site_name", "recipient_name", "recipient_email", "verification_code", "expires_in_minutes"],
    official: {
      subject: "[{{site_name}}] 邮箱验证码",
      html: shell("邮箱验证码", "#4f46e5", `<p>{{recipient_name}}，您好：</p>
<p>您的验证码是：</p>
<p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;">{{verification_code}}</p>
<p>验证码将在 <strong>{{expires_in_minutes}}</strong> 分钟后失效。</p>
<p>如果不是您本人操作，请忽略此邮件。</p>`),
    },
  },
  "password-reset": {
    label: "密码重置",
    description: "用户忘记密码后发送一次性重置链接。",
    placeholders: ["site_name", "recipient_name", "recipient_email", "reset_url", "expires_in_minutes"],
    official: {
      subject: "[{{site_name}}] 密码重置请求",
      html: shell("密码重置", "#7c3aed", `<p>{{recipient_name}}，您好：</p>
<p>我们收到了您的密码重置请求，请点击下方按钮设置新密码。</p>
<p><a class="button" href="{{reset_url}}">重置密码</a></p>
<p>此链接将在 <strong>{{expires_in_minutes}}</strong> 分钟后失效。</p>
<p class="muted">如果按钮无法点击，请复制以下链接到浏览器中打开：<br>{{reset_url}}</p>
<p>如果不是您本人操作，请忽略此邮件。</p>`),
    },
  },
  "notification-email-verification": {
    label: "通知邮箱验证码",
    description: "新增或更换工作区通知邮箱时验证地址归属。",
    placeholders: ["site_name", "recipient_name", "recipient_email", "verification_code", "expires_in_minutes"],
    official: {
      subject: "[{{site_name}}] 通知邮箱验证码",
      html: shell("通知邮箱验证", "#0ea5e9", `<p>{{recipient_name}}，您好：</p>
<p>您正在添加额外的通知邮箱，请输入以下验证码完成验证。</p>
<p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center;">{{verification_code}}</p>
<p>验证码将在 <strong>{{expires_in_minutes}}</strong> 分钟后失效。</p>
<p>如果不是您本人操作，请忽略此邮件。</p>`),
    },
  },
  "low-balance": {
    label: "余额不足提醒",
    description: "工作区余额低于平台提醒阈值时发送。",
    placeholders: ["site_name", "recipient_name", "recipient_email", "current_balance", "threshold", "recharge_url", "unsubscribe_url"],
    official: {
      subject: "[{{site_name}}] 余额不足提醒",
      html: shell("余额不足提醒", "#d97706", `<p>{{recipient_name}}，您好：</p>
<p>您当前余额为 <strong>\${{current_balance}}</strong>，已低于提醒阈值 <strong>\${{threshold}}</strong>。</p>
<p>请及时充值以免服务中断。</p>
<p><a class="button" href="{{recharge_url}}">立即充值</a></p>
<p class="muted"><a href="{{unsubscribe_url}}">退订此类余额提醒</a></p>`),
    },
  },
  "recharge-success": {
    label: "余额充值成功",
    description: "在线充值或管理员充值到账后发送。",
    placeholders: ["site_name", "recipient_name", "recipient_email", "recharge_amount", "current_balance", "order_id"],
    official: {
      subject: "[{{site_name}}] 余额充值成功",
      html: shell("余额充值成功", "#16a34a", `<p>{{recipient_name}}，您好：</p>
<p>您的余额充值 <strong>\${{recharge_amount}}</strong> 已完成。</p>
<p>当前余额：<strong>\${{current_balance}}</strong></p>
<p>订单号：{{order_id}}</p>`),
    },
  },
  "account-quota-alert": {
    label: "账号限额告警",
    description: "应用订阅月调用配额达到告警阈值时发送。",
    placeholders: ["site_name", "recipient_name", "recipient_email", "account_id", "account_name", "platform", "quota_dimension", "quota_used", "quota_limit", "quota_remaining", "quota_threshold"],
    official: {
      subject: "[{{site_name}}] 账号限额告警 - {{account_name}}",
      html: shell("账号限额告警", "#dc2626", `<p>上游账号 <strong>{{account_name}}</strong> 已触发配置的额度告警阈值。</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td>账号 ID</td><td>{{account_id}}</td></tr>
  <tr><td>平台</td><td>{{platform}}</td></tr>
  <tr><td>维度</td><td>{{quota_dimension}}</td></tr>
  <tr><td>已用 / 限额</td><td>{{quota_used}} / {{quota_limit}}</td></tr>
  <tr><td>剩余额度</td><td>{{quota_remaining}}</td></tr>
  <tr><td>告警阈值</td><td>{{quota_threshold}}</td></tr>
</table>`),
    },
  },
};

export type EmailSettings = {
  templates: Record<EmailEventId, EmailTemplate>;
  alerts: {
    lowBalanceEnabled: boolean;
    lowBalanceThreshold: string;
    rechargeUrl: string;
    quotaAlertEnabled: boolean;
    quotaThresholdPercent: number;
  };
};

export const defaultEmailSettings: EmailSettings = {
  templates: Object.fromEntries(emailEventIds.map((id) => [id, emailEventDefinitions[id].official])) as Record<EmailEventId, EmailTemplate>,
  alerts: {
    lowBalanceEnabled: false,
    lowBalanceThreshold: "0.10",
    rechargeUrl: "",
    quotaAlertEnabled: true,
    quotaThresholdPercent: 80,
  },
};

export function emailTemplateUnknownPlaceholders(eventId: EmailEventId, value: string) {
  const allowed = new Set<string>(emailEventDefinitions[eventId].placeholders);
  return [...value.matchAll(/{{\s*([^{}]+?)\s*}}/g)]
    .map((match) => match[1].trim())
    .filter((placeholder, index, values) => !allowed.has(placeholder) && values.indexOf(placeholder) === index);
}
