import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/password-reset-form";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  return <AuthShell title="设置新密码" description="设置成功后，当前账号的所有旧会话都会立即退出。"><ResetPasswordForm token={typeof params.token === "string" ? params.token : ""} /></AuthShell>;
}
