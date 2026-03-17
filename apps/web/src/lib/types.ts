export type TaskStatus =
  | "PENDING"
  | "PLANNING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "REJECTED"
  | "CANCELED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type StepStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Step {
  id: string;
  task_id: string;
  type: string;
  title: string;
  position: number;
  tool_name: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  status: StepStatus;
  attempt: number;
  duration_ms: number | null;
  error_code: string | null;
  requires_approval: boolean;
  started_at: string | null;
  ended_at: string | null;
}

export interface Approval {
  id: string;
  task_id: string;
  action_type: string;
  payload: Record<string, unknown> | null;
  status: ApprovalStatus;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  decided_by: string | null;
  reason: string | null;
}

export interface Artifact {
  id: string;
  task_id: string;
  type: string;
  path: string;
  metadata: Record<string, unknown> | null;
  sha256: string | null;
  size: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface TaskListItem {
  id: string;
  title: string;
  goal: string;
  status: TaskStatus;
  risk_level: RiskLevel;
  workspace_path: string | null;
  requested_by: string | null;
  model_profile: string | null;
  final_report: string | null;
  created_at: string;
  updated_at: string;
  step_count: number;
  approval_count: number;
  pending_approval_count: number;
  artifact_count: number;
}

export interface TaskDetail {
  id: string;
  title: string;
  goal: string;
  status: TaskStatus;
  risk_level: RiskLevel;
  workspace_path: string | null;
  requested_by: string | null;
  model_profile: string | null;
  final_report: string | null;
  created_at: string;
  updated_at: string;
  steps: Step[];
  approvals: Approval[];
  artifacts: Artifact[];
}

export interface LogEvent {
  id: string;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  trace_id: string;
  tool_call_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface TaskLogs {
  task_id: string;
  status: TaskStatus;
  steps: Step[];
  events: LogEvent[];
}

export interface TaskReplay {
  task_id: string;
  status: TaskStatus;
  artifacts: Artifact[];
}

export interface ToolCapability {
  name: string;
  description: string;
  requires_approval: boolean;
  category: string;
}

export interface Capabilities {
  planner_model: string;
  coder_model: string;
  worker_model: string;
  sandbox: string;
  desktop_control: boolean;
  selected_mode: string;
  preferred_mode: string;
  available_modes: string[];
  auth_provider: string;
  live_mode_available: boolean;
  codex_mode_available: boolean;
  demo_mode_available: boolean;
  codex_cli_available: boolean;
  codex_login_configured: boolean;
  openai_api_key_configured: boolean;
  auth_account_email: string | null;
  auth_account_id: string | null;
  auth_plan_type: string | null;
  auth_last_refresh: string | null;
  auth_login_command: string;
  auth_logout_command: string;
  browser_available: boolean;
  browser_channel: string | null;
  runtime_reason: string;
  running_tasks: number;
  tools: ToolCapability[];
  approval_actions: string[];
}

export interface CreateTaskInput {
  title: string;
  goal: string;
  risk_level?: RiskLevel;
  workspace_path?: string | null;
  requested_by?: string | null;
  model_profile?: string | null;
}

export interface ApprovalDecisionInput {
  decided_by?: string | null;
  reason?: string | null;
}

export interface RuntimePreferenceInput {
  preferred_mode: "auto" | "codex" | "live" | "demo";
}

export interface RuntimeDiagnostics {
  app_version: string;
  selected_mode: string;
  preferred_mode: string;
  auth_provider: string;
  runtime_reason: string;
  workspace_root: string;
  artifacts_dir: string;
  logs_dir: string;
  database_url: string;
  model: string;
  codex_model: string | null;
  browser_available: boolean;
  browser_channel: string | null;
  browser_executable_path: string | null;
  headless_browser: boolean;
  running_tasks: number;
  total_tasks: number;
  waiting_approvals: number;
  completed_tasks: number;
  failed_tasks: number;
  login_command: string;
  logout_command: string;
}

export interface OperatorRecovery {
  restarted_task_ids: string[];
  skipped_task_ids: string[];
  restarted_count: number;
}

export interface AgentPreset {
  id: string;
  name: string;
  title: string;
  goal: string;
  workspace_path: string | null;
  risk_level: RiskLevel;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentPresetCreateInput {
  name: string;
  title: string;
  goal: string;
  workspace_path?: string | null;
  risk_level?: RiskLevel;
  created_by?: string | null;
}

export interface WorkspaceEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_project: boolean;
}

export interface WorkspaceBrowse {
  current_path: string;
  parent_path: string | null;
  roots: string[];
  entries: WorkspaceEntry[];
}

export interface BrowserPreviewInput {
  url: string;
}

export interface BrowserPreview {
  preview_id: string;
  url: string;
  title: string;
  text_excerpt: string;
  interactive_elements: Array<Record<string, unknown>>;
  screenshot_path: string;
  screenshot_mime_type: string;
}

export type BrowserSessionActionType = "goto" | "click" | "type" | "press" | "scroll" | "snapshot" | "extract";

export interface BrowserSession {
  session_id: string;
  url: string;
  title: string;
  text_excerpt: string;
  interactive_elements: Array<Record<string, unknown>>;
  screenshot_path: string;
  screenshot_mime_type: string;
  last_action: string;
  last_selector: string | null;
  last_extract: Record<string, unknown> | null;
  headless: boolean;
  started_at: string;
  updated_at: string;
}

export interface BrowserSessionCreateInput {
  url: string;
  headless?: boolean | null;
}

export interface BrowserSessionActionInput {
  action: BrowserSessionActionType;
  url?: string | null;
  selector?: string | null;
  text?: string | null;
  key?: string | null;
  delta_x?: number;
  delta_y?: number;
  label?: string | null;
}

export interface ChatSession {
  id: string;
  title: string;
  workspace_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ChatSessionDetail {
  id: string;
  title: string;
  workspace_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatSessionCreateInput {
  title?: string | null;
  workspace_path?: string | null;
  created_by?: string | null;
}

export interface ChatMessageCreateInput {
  content: string;
}

export type OnboardingStepStatus = "done" | "ready" | "blocked" | "optional";

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  status: OnboardingStepStatus;
  detail: string | null;
}

export interface OnboardingStatus {
  is_complete: boolean;
  completed_at: string | null;
  workspace_path: string | null;
  remote_origin: string | null;
  codex_login_required: boolean;
  auth_ready: boolean;
  workspace_ready: boolean;
  workspace_access_ready: boolean;
  browser_ready: boolean;
  launch_ready: boolean;
  selected_mode: string;
  auth_provider: string;
  runtime_reason: string;
  auth_account_email: string | null;
  auth_plan_type: string | null;
  login_command: string;
  logout_command: string;
  workspace_root: string;
  browser_channel: string | null;
  steps: OnboardingStep[];
}

export interface OnboardingUpdateInput {
  workspace_path?: string | null;
  workspace_access_ready?: boolean | null;
  remote_origin?: string | null;
  mark_complete?: boolean | null;
}

export interface DesktopPermissionStatus {
  accessibility: string;
  screen: string;
  microphone: string;
  camera: string;
}

export type DesktopPermissionPane = "accessibility" | "screen" | "files" | "all-files";

export interface DesktopWorkspaceAccessCheckResult {
  granted: boolean;
  path: string;
  detail: string;
  suggested_pane: "files" | "all-files" | null;
}

export interface DesktopBridgeStatus {
  is_desktop_app: boolean;
  platform: string;
  permissions: DesktopPermissionStatus;
  daemon: DesktopDaemonStatus;
  runtime: DesktopRuntimeStatus;
}

export interface DesktopDaemonStatus {
  available: boolean;
  installed: boolean;
  loaded: boolean;
  label: string | null;
  plist_path: string | null;
  stdout_path: string | null;
  stderr_path: string | null;
  summary: string;
}

export interface DesktopRuntimeProcessStatus {
  status: "idle" | "starting" | "installing" | "ready" | "needs-python" | "error" | "external";
  message: string | null;
  url: string;
  bundled: boolean;
  python_path?: string | null;
  install_url?: string | null;
  last_installed_at?: string | null;
  bundled_python_available?: boolean;
  bundled_python_version?: string | null;
}

export interface DesktopAuthStatus {
  status: "idle" | "starting" | "waiting_browser" | "ready" | "error";
  message: string | null;
  browser_url: string | null;
  cli_available: boolean;
  install_url: string;
}

export interface DesktopBridgeApi {
  getStatus: () => Promise<DesktopBridgeStatus>;
  installLocalRuntime: () => Promise<DesktopBridgeStatus>;
  restartLocalServices: () => Promise<DesktopBridgeStatus>;
  chooseDirectory: () => Promise<string | null>;
  checkWorkspaceAccess: (targetPath: string) => Promise<DesktopWorkspaceAccessCheckResult>;
  promptAccessibility: () => Promise<boolean>;
  promptScreenAccess: () => Promise<string>;
  openSystemPreferences: (pane: DesktopPermissionPane) => Promise<boolean>;
  openChatLogin: () => Promise<boolean>;
  openRemoteAccessApp: () => Promise<boolean>;
  relaunchApp: () => Promise<boolean>;
  installBackgroundAgent: () => Promise<DesktopDaemonStatus>;
  uninstallBackgroundAgent: () => Promise<DesktopDaemonStatus>;
  runTerminalCommand: (command: string) => Promise<boolean>;
  prepareTerminalCommand: (command: string) => Promise<string>;
}

export interface DesktopRuntimeStatus {
  mode: "bundled" | "source" | "external";
  support_dir: string | null;
  data_dir: string | null;
  logs_dir: string | null;
  app_version: string;
  runtime_generated_at: string | null;
  runtime_fingerprint: string | null;
  auth: DesktopAuthStatus;
  web: DesktopRuntimeProcessStatus;
  api: DesktopRuntimeProcessStatus;
}

export interface Portal {
  id: string;
  actor_key: string;
  slug: string;
  source: string;
  user_login: string | null;
  user_name: string | null;
  profile_picture_url: string | null;
  workspace_path: string | null;
  portal_url: string | null;
  session_count: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
}

export interface PortalUpdateInput {
  workspace_path?: string | null;
}

export interface TailscaleStatus {
  cli_available: boolean;
  cli_path: string | null;
  desktop_install_url: string;
  mobile_install_url: string;
  ios_install_url: string;
  android_install_url: string;
  status_readable: boolean;
  status_message: string | null;
  logged_in: boolean;
  service_running: boolean;
  has_node_key: boolean;
  backend_state: string | null;
  auth_url: string | null;
  self_id: string | null;
  self_dns_name: string | null;
  current_tailnet: string | null;
  suggested_device_name: string | null;
  suggested_device_name_source: "tailscale" | "hostname" | null;
  current_user_login: string | null;
  current_user_name: string | null;
  serve_enabled: boolean;
  serve_matches_runtime: boolean;
  serve_target: string | null;
  serve_hosts: string[];
  serve_url: string | null;
  serve_config: Record<string, unknown> | null;
  recommended_command: string | null;
  recommended_script_path: string;
  portal_auto_provisioning: boolean;
  identity_headers_expected: string[];
}

export interface TailscaleServeApplyResult {
  success: boolean;
  message: string;
  command: string;
  serve_url: string | null;
  approval_url: string | null;
}
