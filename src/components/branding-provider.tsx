"use client";

import { createContext, useContext } from "react";
import { defaultPlatformConfig, type PlatformConfig } from "@/lib/platform";

const BrandingContext = createContext<PlatformConfig>(defaultPlatformConfig);

export function BrandingProvider({ config, children }: { config: PlatformConfig; children: React.ReactNode }) {
  return <BrandingContext.Provider value={config}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}
