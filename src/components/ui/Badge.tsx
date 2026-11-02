import type { ReactNode } from "react";

export type Tone = "neutral" | "success" | "warning" | "danger" | "accent" | "info";

const toneStyles: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: "var(--color-surface-sunken)", fg: "var(--color-text-secondary)", border: "var(--color-border-default)" },
  success: { bg: "var(--color-success-subtle)", fg: "var(--color-on-success)", border: "var(--color-success)" },
  warning: { bg: "var(--color-warning-subtle)", fg: "var(--color-on-warning)", border: "var(--color-warning)" },
  danger: { bg: "var(--color-danger-subtle)", fg: "var(--color-on-danger)", border: "var(--color-danger)" },
  accent: { bg: "var(--color-accent-subtle)", fg: "var(--color-accent)", border: "var(--color-accent)" },
  info: { bg: "var(--color-info-subtle)", fg: "var(--color-info)", border: "var(--color-info)" },
};

export interface BadgeProps {
  tone?: Tone;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
}

/**
 * Status pill. ALWAYS carries a text label — color alone never conveys state
 * (SRS 13.2). Optional dot icon supplements but never replaces the label.
 */
export function Badge({ tone = "neutral", label, icon, title }: BadgeProps) {
  const t = toneStyles[tone];
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "2px var(--space-2)",
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${t.border}`,
        background: t.bg,
        color: t.fg,
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-medium)",
        whiteSpace: "normal",
        lineHeight: '1.7',
      }}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : <span aria-hidden="true">●</span>}
      {label}
    </span>
  );
}
