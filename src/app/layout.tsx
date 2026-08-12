import type { Metadata } from "next";
import { connection } from "next/server";
import { AppLaunch } from "@/components/app-launch";
import { BrandingProvider } from "@/components/branding-provider";
import { platformIconUrl } from "@/lib/platform";
import { getPlatformConfig } from "@/lib/server/installation";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const config = await getPlatformConfig();
  return {
    title: { default: `${config.name} - API 开放分发平台`, template: `%s | ${config.name}` },
    description: config.description,
    icons: { icon: config.hasCustomIcon ? platformIconUrl(config) : "/favicon.ico" },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const config = await getPlatformConfig();
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem("star-api-theme");const s=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t||s;document.documentElement.style.colorScheme=t||s}catch{}` }} />
        <script dangerouslySetInnerHTML={{ __html: `try{const k="star-api-launch-seen";const seen=sessionStorage.getItem(k);document.documentElement.dataset.appLaunch=seen?"skip":"play";if(!seen)sessionStorage.setItem(k,"1")}catch{document.documentElement.dataset.appLaunch="play"}` }} />
      </head>
      <body><AppLaunch config={config} /><BrandingProvider config={config}>{children}</BrandingProvider></body>
    </html>
  );
}
