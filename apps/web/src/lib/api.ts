import type {
  AgentPreset,
  AgentPresetCreateInput,
  Approval,
  ApprovalDecisionInput,
  BrowserPreview,
  BrowserPreviewInput,
  BrowserSession,
  BrowserSessionActionInput,
  BrowserSessionCreateInput,
  Capabilities,
  ChatMessageCreateInput,
  ChatSession,
  ChatSessionCreateInput,
  ChatSessionDetail,
  CreateTaskInput,
  OperatorRecovery,
  OnboardingStatus,
  OnboardingUpdateInput,
  Portal,
  PortalUpdateInput,
  RuntimeDiagnostics,
  RuntimePreferenceInput,
  TailscaleServeApplyResult,
  TailscaleStatus,
  TaskDetail,
  TaskListItem,
  TaskLogs,
  TaskReplay,
  WorkspaceBrowse,
} from "@/lib/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/elemate-api";

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (/^https?:\/\//.test(API_BASE_URL)) {
    return new URL(path, API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`).toString();
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000";
  const normalizedBase = API_BASE_URL.startsWith("/") ? API_BASE_URL : `/${API_BASE_URL}`;
  return new URL(`${normalizedBase}${path}`, origin).toString();
}

function parseJsonSafely<T>(raw: string): T | null {
  if (!raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const publicOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(publicOrigin
        ? {
            "X-EleMate-Public-Origin": publicOrigin,
            "X-Forge-Public-Origin": publicOrigin,
          }
        : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const rawBody = await response.text();
    const payload = parseJsonSafely<{ detail?: string }>(rawBody);
    let message = `Request failed: ${response.status}`;
    if (payload?.detail) {
      message = payload.detail;
    } else if (rawBody.trim()) {
      message = rawBody;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength === "0") {
    return undefined as T;
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return undefined as T;
  }
  const payload = parseJsonSafely<T>(rawBody);
  if (payload !== null) {
    return payload;
  }
  throw new Error("Response body was not valid JSON.");
}

export function fetchCapabilities(): Promise<Capabilities> {
  return apiRequest<Capabilities>("/capabilities");
}

export function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  return apiRequest<OnboardingStatus>("/onboarding/status");
}

export function updateOnboardingStatus(payload: OnboardingUpdateInput): Promise<OnboardingStatus> {
  return apiRequest<OnboardingStatus>("/onboarding/status", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchPortalMe(): Promise<Portal> {
  return apiRequest<Portal>("/portal/me");
}

export function updatePortalMe(payload: PortalUpdateInput): Promise<Portal> {
  return apiRequest<Portal>("/portal/me", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTailscaleStatus(): Promise<TailscaleStatus> {
  return apiRequest<TailscaleStatus>("/tailscale/status");
}

export function enableTailscaleServe(): Promise<TailscaleServeApplyResult> {
  return apiRequest<TailscaleServeApplyResult>("/tailscale/serve/enable", {
    method: "POST",
  });
}

export function resetTailscaleServe(): Promise<TailscaleServeApplyResult> {
  return apiRequest<TailscaleServeApplyResult>("/tailscale/serve/reset", {
    method: "POST",
  });
}

export function fetchChatSessions(): Promise<ChatSession[]> {
  return apiRequest<ChatSession[]>("/chat/sessions");
}

export function createChatSession(payload: ChatSessionCreateInput): Promise<ChatSessionDetail> {
  return apiRequest<ChatSessionDetail>("/chat/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchChatSession(sessionId: string): Promise<ChatSessionDetail> {
  return apiRequest<ChatSessionDetail>(`/chat/sessions/${sessionId}`);
}

export function sendChatMessage(sessionId: string, payload: ChatMessageCreateInput): Promise<ChatSessionDetail> {
  return apiRequest<ChatSessionDetail>(`/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteChatSession(sessionId: string): Promise<void> {
  return apiRequest<void>(`/chat/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export function fetchAgentPresets(): Promise<AgentPreset[]> {
  return apiRequest<AgentPreset[]>("/agents");
}

export function createAgentPreset(payload: AgentPresetCreateInput): Promise<AgentPreset> {
  return apiRequest<AgentPreset>("/agents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteAgentPreset(presetId: string): Promise<void> {
  return apiRequest<void>(`/agents/${presetId}`, {
    method: "DELETE",
  });
}

export function browseWorkspaces(path?: string): Promise<WorkspaceBrowse> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  return apiRequest<WorkspaceBrowse>(`/workspaces/browse${query}`);
}

export function previewBrowserPage(payload: BrowserPreviewInput): Promise<BrowserPreview> {
  return apiRequest<BrowserPreview>("/browser/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchBrowserSessions(): Promise<BrowserSession[]> {
  return apiRequest<BrowserSession[]>("/browser/sessions");
}

export function createBrowserSession(payload: BrowserSessionCreateInput): Promise<BrowserSession> {
  return apiRequest<BrowserSession>("/browser/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchBrowserSession(sessionId: string): Promise<BrowserSession> {
  return apiRequest<BrowserSession>(`/browser/sessions/${sessionId}`);
}

export function executeBrowserSessionAction(sessionId: string, payload: BrowserSessionActionInput): Promise<BrowserSession> {
  return apiRequest<BrowserSession>(`/browser/sessions/${sessionId}/actions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteBrowserSession(sessionId: string): Promise<void> {
  return apiRequest<void>(`/browser/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export function updateRuntimePreference(payload: RuntimePreferenceInput): Promise<Capabilities> {
  return apiRequest<Capabilities>("/runtime/preferences", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logoutCodexAuth(): Promise<Capabilities> {
  return apiRequest<Capabilities>("/auth/logout", {
    method: "POST",
  });
}

export function fetchRuntimeDiagnostics(): Promise<RuntimeDiagnostics> {
  return apiRequest<RuntimeDiagnostics>("/operator/diagnostics");
}

export function recoverStalledTasks(): Promise<OperatorRecovery> {
  return apiRequest<OperatorRecovery>("/operator/recover", {
    method: "POST",
  });
}

export function fetchTasks(): Promise<TaskListItem[]> {
  return apiRequest<TaskListItem[]>("/tasks");
}

export function fetchTask(taskId: string): Promise<TaskDetail> {
  return apiRequest<TaskDetail>(`/tasks/${taskId}`);
}

export function fetchTaskLogs(taskId: string): Promise<TaskLogs> {
  return apiRequest<TaskLogs>(`/tasks/${taskId}/logs`);
}

export function fetchTaskReplay(taskId: string): Promise<TaskReplay> {
  return apiRequest<TaskReplay>(`/tasks/${taskId}/replay`);
}

export function createTask(payload: CreateTaskInput): Promise<TaskDetail> {
  return apiRequest<TaskDetail>("/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function approveTask(taskId: string, payload: ApprovalDecisionInput): Promise<Approval> {
  return apiRequest<Approval>(`/tasks/${taskId}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function rejectTask(taskId: string, payload: ApprovalDecisionInput): Promise<Approval> {
  return apiRequest<Approval>(`/tasks/${taskId}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelTask(taskId: string): Promise<TaskDetail> {
  return apiRequest<TaskDetail>(`/tasks/${taskId}/cancel`, {
    method: "POST",
  });
}
