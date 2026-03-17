import type { Portal, TailscaleStatus } from "@/lib/types";
import { WEB_APP_VERSION } from "@/lib/build-info";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildPortalLink(baseOrigin: string, slug?: string | null): string {
  const normalized = trimTrailingSlash(baseOrigin);
  const cleanSlug = slug?.trim();
  const basePath = cleanSlug ? `${normalized}/portal/${cleanSlug}` : `${normalized}/portal`;
  return `${basePath}?v=${encodeURIComponent(WEB_APP_VERSION)}`;
}

function isLocalOrigin(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname;
    return ["127.0.0.1", "localhost", "0.0.0.0", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

export function resolvePortalLink(
  portal: Portal | null,
  tailscaleStatus: TailscaleStatus | null,
): string | null {
  const slug = portal?.slug?.trim();
  const tailscaleReadable = Boolean(tailscaleStatus?.status_readable);
  const serveUrl =
    tailscaleReadable && tailscaleStatus?.serve_enabled && tailscaleStatus?.serve_matches_runtime && tailscaleStatus.serve_url && !isLocalOrigin(tailscaleStatus.serve_url)
      ? trimTrailingSlash(tailscaleStatus.serve_url)
      : null;
  const portalUrl =
    portal?.portal_url && !isLocalOrigin(portal.portal_url)
      ? trimTrailingSlash(portal.portal_url)
      : null;

  if (serveUrl && slug) {
    return buildPortalLink(serveUrl, slug);
  }

  if (serveUrl) {
    return serveUrl;
  }

  if (!tailscaleStatus && portalUrl) {
    return portalUrl;
  }

  return null;
}
