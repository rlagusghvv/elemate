"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BRAND_DESCRIPTION, BRAND_DOWNLOAD_URL, BRAND_NAME } from "@/lib/brand";

export function NavBar() {
  const pathname = usePathname();

  if (pathname !== "/" && pathname !== "/download") {
    return null;
  }

  return (
    <header className="mb-6 px-1 pt-2 sm:mb-8 sm:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-full border border-white/10 bg-[rgba(8,11,18,0.72)] px-5 py-3 backdrop-blur">
        <Link href="/" className="min-w-0 no-underline">
          <p className="font-display text-[24px] font-semibold leading-none tracking-[-0.05em] text-ink">{BRAND_NAME}</p>
          <p className="mt-1 text-[12px] leading-5 tracking-[-0.015em] text-steel">{BRAND_DESCRIPTION}</p>
        </Link>

        <nav className="flex flex-wrap items-center gap-2.5 text-sm">
          <Link
            href={pathname === "/" ? "#overview" : "/"}
            className="ui-button-tertiary"
          >
            소개
          </Link>
          <Link
            href={pathname === "/" ? "#install" : "/download"}
            className="ui-button-tertiary"
          >
            설치
          </Link>
          <Link
            href={BRAND_DOWNLOAD_URL}
            className="ui-button-primary min-h-10 px-4 py-2"
          >
            다운로드
          </Link>
        </nav>
      </div>
    </header>
  );
}
