import { useEffect, useRef, useState } from "react";
import { useCopy, useFormat } from "@/lib/hooks";
import { useDemo } from "@/state/DemoProvider";
import { useAsync } from "@/lib/useAsync";
import { Badge } from "@/components/ui/Badge";
import type { Tone } from "@/components/ui/Badge";

const toneByNotification: Record<string, Tone> = {
  success: "success",
  warning: "warning",
  info: "info",
};

/** Notifications trigger + popover. Mock data only — no email is ever sent. */
export function NotificationsMenu() {
  const t = useCopy();
  const f = useFormat();
  const { repo } = useDemo();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const notifications = useAsync(() => repo.getNotifications(), [repo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  const count = notifications.data?.length ?? 0;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t("shell.notifications")}${count > 0 ? ` (${count})` : ""}`}
        style={{
          minHeight: "var(--size-control-height)",
          paddingInline: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border-default)",
          background: "var(--color-surface-raised)",
          cursor: "pointer",
          position: "relative",
        }}
      >
        <span aria-hidden="true">🔔</span>
        {count > 0 && (
          <span
            className="num-ltr"
            style={{
              position: "absolute",
              insetBlockStart: "-6px",
              insetInlineEnd: "-6px",
              background: "var(--color-danger)",
              color: "var(--color-on-primary)",
              borderRadius: "var(--radius-full)",
              fontSize: "11px",
              minWidth: "18px",
              height: "18px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              paddingInline: "4px",
            }}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t("shell.notifications")}
          style={{
            position: "absolute",
            insetBlockStart: "calc(100% + var(--space-2))",
            insetInlineEnd: 0,
            width: "min(360px, 90vw)",
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border-default)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            zIndex: "var(--z-dropdown)",
            padding: "var(--space-3)",
          }}
        >
          <h3 style={{ marginBlockEnd: "var(--space-3)", fontSize: "var(--font-size-sm)" }}>{t("shell.notifications")}</h3>
          {notifications.status === "loading" && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{t("common.loading")}</p>
          )}
          {notifications.status === "error" && (
            <p style={{ color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>{t("common.errorTitle")}</p>
          )}
          {notifications.status === "success" && count === 0 && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{t("shell.notificationsEmpty")}</p>
          )}
          {notifications.data && count > 0 && (
            <ul className="stack-sm">
              {notifications.data.map((n) => (
                <li key={n.id} className="stack-sm" style={{ paddingBlockEnd: "var(--space-2)", borderBlockEnd: "1px solid var(--color-border-subtle)" }}>
                  <Badge tone={toneByNotification[n.tone] ?? "info"} label={t(n.copyKey)} />
                  <time className="num-ltr" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                    {f.dateTime(n.time)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
