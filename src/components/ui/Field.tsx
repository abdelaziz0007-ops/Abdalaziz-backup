import type { ReactNode, SelectHTMLAttributes } from "react";

export interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

/**
 * Persistent visible label + hint/error wiring (WCAG 2.2 / SRS 13.2).
 * Labels are never replaced by placeholders.
 */
export function Field({ id, label, hint, error, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <label htmlFor={id} style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
        {label}
      </label>
      {children({ inputId: id, describedBy })}
      {hint && (
        <span id={hintId} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger)" }}>
          {error}
        </span>
      )}
    </div>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ value: string; label: string; disabled?: boolean }>;
}

export function Select({ options, style, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      style={{
        minHeight: "var(--size-control-height)",
        padding: "0 var(--space-3)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border-default)",
        background: "var(--color-surface-raised)",
        color: "var(--color-text-primary)",
        fontSize: "var(--font-size-sm)",
        maxWidth: "100%",
        ...style,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
