import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** right-align numeric columns; alignment uses logical "end" so it mirrors correctly */
  numeric?: boolean;
  width?: string;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  /** Accessible name for the scroll region + table (required for wide tables). */
  label: string;
  caption?: ReactNode;
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
}

/**
 * Semantic table inside a focusable, labeled scroll region (keyboard-scrollable
 * when it overflows — SRS 13.2 "wide tables scroll in their own region").
 * Numeric columns are tabular and aligned to logical "end".
 */
export function DataTable<T>({ label, caption, columns, rows, rowKey }: DataTableProps<T>) {
  return (
    <div className="scroll-region" role="region" aria-label={label} tabIndex={0}>
      <table className="data-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? "align-end" : undefined} style={{ width: c.width }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? "align-end tabular num" : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
