import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, CSSProperties> = {
  primary: {
    background: "var(--color-primary)",
    color: "var(--color-on-primary)",
    border: "1px solid var(--color-primary)",
  },
  secondary: {
    background: "var(--color-surface-raised)",
    color: "var(--color-text-primary)",
    border: "1px solid var(--color-border-default)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-text-primary)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--color-danger)",
    color: "var(--color-on-primary)",
    border: "1px solid var(--color-danger)",
  },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

/**
 * Shared button. Height follows density tokens; on coarse pointers (mobile)
 * it grows to the 44px touch minimum via the media query below.
 */
export function Button({ variant = "secondary", children, style, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      style={{
        minHeight: "var(--size-control-height)",
        padding: "0 var(--space-4)",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--font-size-sm)",
        fontWeight: "var(--font-weight-medium)" as const,
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.55 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export const touchFriendlyCss = `
@media (pointer: coarse) {
  .fw-btn { min-height: 44px !important; }
}
`;
