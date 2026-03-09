import { headers } from "next/headers";

import { AppAccessGate } from "@/components/app-access-gate";
import { ChatDashboard } from "@/components/chat-dashboard";

function isLocalHost(host: string | null): boolean {
  if (!host) {
    return true;
  }
  const normalized = host.replace(/:\d+$/, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

export default async function AppPage() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");

  if (!isLocalHost(host)) {
    return <AppAccessGate requestHost={host} />;
  }

  return <ChatDashboard />;
}
