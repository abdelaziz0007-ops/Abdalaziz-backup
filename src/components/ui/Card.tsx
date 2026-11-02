import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Card({ title, description, actions, children, style, ...rest }: CardProps) {
  return (
    <section
      {...rest}
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "var(--space-5)",
        ...style,
      }}
    >
      {(title || actions) && (
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-3)",
            marginBlockEnd: description ? "var(--space-2)" : "var(--space-4)",
            flexWrap: "wrap",
          }}
        >
          {title && <h2 style={{ flex: "1 1 auto" }}>{title}</h2>}
          {actions && <div className="row-wrap">{actions}</div>}
        </header>
      )}
      {description && (
        <p style={{ color: "var(--color-text-secondary)", marginBlockEnd: "var(--space-4)" }}>{description}</p>
      )}
      {children}
    </section>
  );
}
