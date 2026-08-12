import Image from "next/image";
import { Waypoints } from "lucide-react";
import { platformIconUrl, type PlatformConfig } from "@/lib/platform";

export function AppLaunch({ config }: { config: PlatformConfig }) {
  return (
    <div className="app-launch" aria-hidden="true">
      <div className="app-launch-inner">
        <span className="app-launch-mark">
          {config.hasCustomIcon ? (
            <Image src={platformIconUrl(config)} alt="" width={52} height={52} priority unoptimized />
          ) : (
            <Waypoints />
          )}
        </span>
        <strong>{config.name}</strong>
        <span className="app-launch-track"><i /></span>
      </div>
    </div>
  );
}
