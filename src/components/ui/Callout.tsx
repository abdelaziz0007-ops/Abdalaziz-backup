import type { ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui/Badge";

export interface CalloutProps {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}

const borderByTone: Record<Tone, string> = {
  neutral: "var(--color-border-default)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  accent: "var(--color-accent)",
  info: "var(--color-info)",
};

const bgByTone: Record<Tone, string> = {
  neutral: "var(--color-surface-sunken)",
  success: "var(--color-success-subtle)",
  warning: "var(--color-warning-subtle)",
  danger: "var(--color-danger-subtle)",
  accent: "var(--color-accent-subtle)",
  info: "var(--color-info-subtle)",
};

/** Inline message with tone, icon, and text label (never color alone). */
export function Callout({ tone = "info", title, children, actions }: CalloutProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        borderInlineStart: `4px solid ${borderByTone[tone]}`,
        background: bgByTone[tone],
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <div className="row-wrap">
        <Badge tone={tone} label={title} />
      </div>
      {children && <div style={{ fontSize: "var(--font-size-sm)" }}>{children}</div>}
      {actions && <div className="row-wrap">{actions}</div>}
    </div>
  );
}
