"use client";

import Image from "next/image";
import { Waypoints } from "lucide-react";
import { useEffect, useState } from "react";
import { platformIconUrl, type PlatformConfig } from "@/lib/platform";

export function AppLaunch({ config }: { config: PlatformConfig }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const delay = document.documentElement.dataset.appLaunch === "skip" ? 0 : 560;
    const timer = window.setTimeout(() => setVisible(false), delay);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <div className="app-launch" aria-hidden="true" onAnimationEnd={() => setVisible(false)}>
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
