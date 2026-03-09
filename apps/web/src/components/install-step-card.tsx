"use client";

import { useMemo, useState } from "react";

interface InstallStepCardProps {
  step: string;
  title: string;
  body: string;
  code: string;
  mode?: "command" | "info";
}

export function InstallStepCard({ step, title, body, code, mode = "command" }: InstallStepCardProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const isCommand = mode === "command";
  const desktopBridge = typeof window !== "undefined" ? window.elemateDesktop ?? window.forgeDesktop : undefined;
  const canLaunchTerminal = isCommand && Boolean(desktopBridge?.runTerminalCommand);

  const actionLabel = useMemo(() => {
    if (!isCommand) {
      return "안내";
    }
    return feedback ?? "명령 복사";
  }, [feedback, isCommand]);

  async function resolveCommand(): Promise<string> {
    if (!isCommand) {
      return code;
    }
    if (desktopBridge?.prepareTerminalCommand) {
      try {
        return await desktopBridge.prepareTerminalCommand(code);
      } catch {
        return code;
      }
    }
    return code;
  }

  async function copyCommand() {
    if (!isCommand) {
      return;
    }
    try {
      await navigator.clipboard.writeText(await resolveCommand());
      setFeedback("복사됨");
      window.setTimeout(() => setFeedback(null), 1800);
    } catch {
      setFeedback("복사 실패");
      window.setTimeout(() => setFeedback(null), 1800);
    }
  }

  async function runInTerminal() {
    if (!isCommand || !desktopBridge?.runTerminalCommand) {
      return;
    }
    try {
      await desktopBridge.runTerminalCommand(await resolveCommand());
      setFeedback("터미널 열림");
      window.setTimeout(() => setFeedback(null), 1800);
    } catch {
      setFeedback("실행 실패");
      window.setTimeout(() => setFeedback(null), 1800);
    }
  }

  return (
    <article className="ui-card flex h-full flex-col">
      <p className="text-[13px] font-semibold tracking-[0.18em] text-steel">{step}</p>
      <p className="mt-4 ui-title-card">{title}</p>
      <p className="ui-copy-sm mt-3">{body}</p>
      <button
        type="button"
        onClick={() => void copyCommand()}
        disabled={!isCommand}
        className={`mt-5 w-full overflow-x-auto rounded-[20px] border border-white/8 bg-[#090e17] px-4 py-3 text-left text-sm leading-7 text-ink ${
          isCommand ? "transition hover:border-white/16 hover:bg-[#0c1422]" : "cursor-default"
        }`}
      >
        <code>{code}</code>
      </button>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copyCommand()}
          disabled={!isCommand}
          className="ui-button-secondary min-h-10 px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {actionLabel}
        </button>
        {canLaunchTerminal ? (
          <button type="button" onClick={() => void runInTerminal()} className="ui-button-tertiary min-h-10 px-4 py-2.5">
            터미널에서 열기
          </button>
        ) : null}
      </div>
    </article>
  );
}
