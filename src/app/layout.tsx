import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "星枢 API - 企业级接口服务平台",
    template: "%s | 星枢 API",
  },
  description: "面向企业的公共 API 聚合、分发、治理与观测平台。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
