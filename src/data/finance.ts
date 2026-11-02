import source from '../../fake-data.json';
import { addStr, subStr, sumStr, dec, formatDec } from '@/lib/decimal';

export interface TrialRow { accountCode: string; name: { ar: string; en: string }; classification: string; signedDebitBalance: string; sourceFile: string; sourceSheet: string; sourceRow: number; role?: 'cash'|'receivables'|'inventory'|'payables' }
export const classifications = ['asset.current','asset.noncurrent','asset.contra','liability.current','liability.noncurrent','equity','income','expense.cost','expense.operating','expense.tax'];
export const defaultRows: TrialRow[] = source.trialBalance.map(row=>({...row,role:({'1000':'cash','1100':'receivables','1200':'inventory','2000':'payables'} as Record<string,TrialRow['role']>)[row.accountCode]}));
export function ratio(a: string, b: string, percent = false): string | null {
  const x = dec(a, 'USD').units, y = dec(b, 'USD').units;
  if (y === 0n) return null;
  const magnitude = y < 0n ? -y : y;
  const numerator = x * (y < 0n ? -1n : 1n) * (percent ? 10000n : 100n);
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute + magnitude / 2n) / magnitude;
  return formatDec({ units: numerator < 0n ? -rounded : rounded, scale: 2 }, 2);
}
export function calculateFinance(rows: TrialRow[]) {
  const sum = (...groups: string[]) => sumStr(rows.filter(r => groups.includes(r.classification)).map(r => r.signedDebitBalance), 'USD');
  const invert = (n: string) => subStr('0', n, 'USD');
  const netRevenue = invert(sum('income'));
  const costOfRevenue = sum('expense.cost');
  const operatingExpenses = sum('expense.operating');
  const taxExpense = sum('expense.tax');
  const grossProfit = subStr(netRevenue, costOfRevenue, 'USD');
  const netProfit = subStr(subStr(grossProfit, operatingExpenses, 'USD'), taxExpense, 'USD');
  const currentAssets = sum('asset.current');
  const nonCurrentAssetsNet = sum('asset.noncurrent','asset.contra');
  const currentLiabilities = invert(sum('liability.current'));
  const nonCurrentLiabilities = invert(sum('liability.noncurrent'));
  const totalAssets = addStr(currentAssets, nonCurrentAssetsNet, 'USD');
  const totalLiabilities = addStr(currentLiabilities, nonCurrentLiabilities, 'USD');
  const totalEquity = addStr(invert(sum('equity')), netProfit, 'USD');
  const liabilitiesAndEquity = addStr(totalLiabilities, totalEquity, 'USD');
  return { netRevenue, costOfRevenue, operatingExpenses, taxExpense, grossProfit, netProfit, currentAssets, nonCurrentAssetsNet, currentLiabilities, nonCurrentLiabilities, totalAssets, totalLiabilities, totalEquity, liabilitiesAndEquity,
    residual: subStr(totalAssets, liabilitiesAndEquity, 'USD'), trialResidual: sumStr(rows.map(r => r.signedDebitBalance), 'USD'), workingCapital: subStr(currentAssets, currentLiabilities, 'USD'), netMargin: ratio(netProfit, netRevenue, true), grossMargin: ratio(grossProfit, netRevenue, true), currentRatio: ratio(currentAssets, currentLiabilities) };
}
/** RFC-style quoted fields; rejects broken quoting rather than publishing partial data. */
export function parseCSV(text: string): string[][] {
  const result: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') { if (quoted && input[i+1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && input[i+1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) result.push(row); row=[]; cell=''; }
    else cell += c;
  }
  if (quoted) throw new Error('CSV: unclosed quoted field');
  row.push(cell.trim()); if (row.some(Boolean)) result.push(row);
  return result;
}
export function readTrialCSV(text: string, name: string): TrialRow[] {
  const [headers, ...records] = parseCSV(text);
  const required = ['accountCode','name','classification','signedDebitBalance'];
  if (!headers || required.some(h => !headers.includes(h))) throw new Error('Required columns: ' + required.join(', '));
  if (!records.length || records.length > 10000) throw new Error('CSV: expected 1–10,000 rows');
  const ids = new Set<string>();
  return records.map((cells, i) => {
    if (cells.length !== headers.length) throw new Error(`Row ${i+2}: column count`);
    const get = (key: string) => cells[headers.indexOf(key)] ?? '';
    const code = get('accountCode'), label = get('name'), amount = get('signedDebitBalance');
    if (!code || !label || ids.has(code)) throw new Error(`Row ${i+2}: missing or duplicate account`);
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) throw new Error(`Row ${i+2}: invalid decimal amount`);
    if (!classifications.includes(get('classification'))) throw new Error(`Row ${i+2}: invalid classification`);
    ids.add(code);
    return { accountCode: code, name: {ar:label,en:label}, classification:get('classification'), signedDebitBalance:formatDec(dec(amount,'USD'),2), sourceFile:name, sourceSheet:'CSV', sourceRow:i+2 };
  });
}
export function csvText(rows: (string | number)[][]): string {
  return '\uFEFF' + rows.map(row => row.map(v => {
    let s = String(v); if (/^[=+@\t\r]/.test(s) || /^-(?!\d)/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g,'""') + '"';
  }).join(',')).join('\r\n');
}
export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], {type})); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
