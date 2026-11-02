import { useEffect, useRef, useState } from "react";
import { useCopy } from "@/lib/hooks";
import { useDemo } from "@/state/DemoProvider";
import { usePreferences } from "@/state/PreferencesProvider";
import { fixtures } from "@/data/repository";

/** User menu. Sign-out is disabled — this is a synthetic demo persona. */
export function UserMenu({ personaName }: { personaName: string }) {
  const t = useCopy();
  const { locale } = usePreferences();
  const { currentPersona } = useDemo();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  const initials = personaName.trim().slice(0, 1) || "؟";

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("shell.userMenu")}
        style={{
          minHeight: "var(--size-control-height)",
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          paddingInline: "var(--space-2)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-border-default)",
          background: "var(--color-surface-raised)",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-primary-subtle)",
            color: "var(--color-primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "var(--font-weight-bold)",
          }}
        >
          {initials}
        </span>
        <span className="fw-desktop-only" style={{ fontSize: "var(--font-size-sm)", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {personaName}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={t("shell.userMenu")}
          style={{
            position: "absolute",
            insetBlockStart: "calc(100% + var(--space-2))",
            insetInlineEnd: 0,
            width: "min(280px, 90vw)",
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border-default)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-lg)",
            zIndex: "var(--z-dropdown)",
            padding: "var(--space-3)",
          }}
        >
          <p style={{ fontWeight: "var(--font-weight-medium)", fontSize: "var(--font-size-sm)" }}>{personaName}</p>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBlockEnd: "var(--space-3)" }}>
            {fixtures.tenant.name[locale]} — {currentPersona?.role}
          </p>
          <button
            type="button"
            role="menuitem"
            disabled
            style={{
              width: "100%",
              textAlign: "start",
              minHeight: "var(--size-control-height)",
              paddingInline: "var(--space-3)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border-subtle)",
              background: "var(--color-surface-sunken)",
              color: "var(--color-text-muted)",
              cursor: "not-allowed",
              fontSize: "var(--font-size-sm)",
            }}
          >
            {t("shell.signOutDemo")}
          </button>
        </div>
      )}
    </div>
  );
}
