import { PortalHeader } from "./portal-header";

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <PortalHeader />
      <main>{children}</main>
    </div>
  );
}
