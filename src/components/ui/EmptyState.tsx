import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function EmptyState({ title, description, actions }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-10) var(--space-4)",
        textAlign: "center",
        color: "var(--color-text-secondary)",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: "var(--font-size-2xl)" }}>◍</span>
      <h3 style={{ color: "var(--color-text-primary)" }}>{title}</h3>
      {description && <p style={{ maxWidth: "48ch" }}>{description}</p>}
      {actions && <div className="row-wrap">{actions}</div>}
    </div>
  );
}
