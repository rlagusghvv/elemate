import type { Metadata } from "next";

import "./globals.css";
import { NavBar } from "@/components/nav";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_DESCRIPTION,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <main>
          <NavBar />
          {children}
        </main>
      </body>
    </html>
  );
}
