export const BRAND_NAME = "EleMate";
export const BRAND_DESCRIPTION = "내 컴퓨터를, 내 개인 에이전트로";
export const BRAND_CATEGORY = "Personal Device Agent";
export const BRAND_TAGLINE = "내 컴퓨터를, 내 코끼리 비서로.";
export const BRAND_DOWNLOAD_URL = process.env.NEXT_PUBLIC_ELEMATE_DOWNLOAD_URL || "/download";
export const BRAND_RELEASES_URL = process.env.NEXT_PUBLIC_ELEMATE_RELEASES_URL || "https://github.com/rlagusghvv/elemate/releases";
export const BRAND_DOWNLOAD_ARM_URL = process.env.NEXT_PUBLIC_ELEMATE_DOWNLOAD_ARM_URL || BRAND_RELEASES_URL;
export const BRAND_DOWNLOAD_INTEL_URL = process.env.NEXT_PUBLIC_ELEMATE_DOWNLOAD_INTEL_URL || BRAND_RELEASES_URL;
export const BRAND_DOWNLOAD_WINDOWS_URL =
  process.env.NEXT_PUBLIC_ELEMATE_DOWNLOAD_WINDOWS_URL || `${BRAND_RELEASES_URL}/latest/download/EleMate-windows-x64.exe`;
export const BRAND_MAC_SUPPORT = "macOS 14 이상";
export const BRAND_WINDOWS_SUPPORT = "Windows x64 프리뷰 준비 중";
export const BRAND_REMOTE_APP_NAME = "Tailscale";
