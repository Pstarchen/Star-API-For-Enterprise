import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/auth";
import { isInstalled } from "@/lib/server/installation";
import { PortalHeader } from "./portal-header";

export async function PortalShell({ children }: { children: React.ReactNode }) {
  await connection();
  if (!(await isInstalled())) redirect("/install");
  const user = await getCurrentUser();
  return (
    <div className="min-h-screen">
      <PortalHeader currentUser={user ? { name: user.name, email: user.email, platformRole: user.platformRole } : null} />
      <main>{children}</main>
    </div>
  );
}
