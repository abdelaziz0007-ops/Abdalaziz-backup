import { calculateFinance, ratio, type TrialRow } from './finance';
import { subStr } from '@/lib/decimal';
import source from '../../fake-data.json';

type Pair = [string, string];
interface Definition { title: Pair; formula: Pair; groups: string[]; field: keyof ReturnType<typeof calculateFinance>; unit?: '%' | '×' }
const income = ['income','expense.cost','expense.operating','expense.tax'];
const definitions: Record<string, Definition> = {
  netRevenue: { title: ['صافي الإيرادات','Net revenue'], formula: ['عكس إشارة مجموع حسابات الإيرادات','Negative of signed income-account balances'], groups: ['income'], field: 'netRevenue' },
  costOfRevenue: { title: ['تكلفة الإيرادات','Cost of revenue'], formula: ['مجموع حسابات تكلفة الإيرادات','Sum of cost-of-revenue accounts'], groups: ['expense.cost'], field: 'costOfRevenue' },
  grossProfit: { title: ['مجمل الربح','Gross profit'], formula: ['صافي الإيرادات − تكلفة الإيرادات','Net revenue − cost of revenue'], groups: ['income','expense.cost'], field: 'grossProfit' },
  operatingExpenses: { title: ['المصروفات التشغيلية','Operating expenses'], formula: ['مجموع حسابات المصروفات التشغيلية','Sum of operating-expense accounts'], groups: ['expense.operating'], field: 'operatingExpenses' },
  taxExpense: { title: ['مصروف الضريبة','Tax expense'], formula: ['مجموع حسابات مصروف الضريبة','Sum of tax-expense accounts'], groups: ['expense.tax'], field: 'taxExpense' },
  netProfit: { title: ['صافي الربح','Net profit'], formula: ['الإيرادات − التكلفة − المصروفات التشغيلية − الضريبة','Revenue − cost − operating expenses − tax'], groups: income, field: 'netProfit' },
  net: { title: ['هامش صافي الربح','Net profit margin'], formula: ['صافي الربح ÷ صافي الإيرادات × 100','Net profit ÷ net revenue × 100'], groups: income, field: 'netMargin', unit: '%' },
  gross: { title: ['هامش مجمل الربح','Gross profit margin'], formula: ['مجمل الربح ÷ صافي الإيرادات × 100','Gross profit ÷ net revenue × 100'], groups: ['income','expense.cost'], field: 'grossMargin', unit: '%' },
  liquidity: { title: ['النسبة الجارية','Current ratio'], formula: ['الأصول المتداولة ÷ الالتزامات المتداولة','Current assets ÷ current liabilities'], groups: ['asset.current','liability.current'], field: 'currentRatio', unit: '×' },
  working: { title: ['رأس المال العامل','Working capital'], formula: ['الأصول المتداولة − الالتزامات المتداولة','Current assets − current liabilities'], groups: ['asset.current','liability.current'], field: 'workingCapital' },
  ca: { title: ['الأصول المتداولة','Current assets'], formula: ['مجموع الأصول المتداولة','Sum of current assets'], groups: ['asset.current'], field: 'currentAssets' },
  nca: { title: ['الأصول غير المتداولة، بالصافي','Non-current assets, net'], formula: ['الأصول غير المتداولة + الأصول المقابلة الموقّعة','Non-current assets + signed contra-assets'], groups: ['asset.noncurrent','asset.contra'], field: 'nonCurrentAssetsNet' },
  assets: { title: ['إجمالي الأصول','Total assets'], formula: ['الأصول المتداولة + الأصول غير المتداولة بالصافي','Current assets + net non-current assets'], groups: ['asset.current','asset.noncurrent','asset.contra'], field: 'totalAssets' },
  cl: { title: ['الالتزامات المتداولة','Current liabilities'], formula: ['عكس إشارة حسابات الالتزامات المتداولة','Negative of signed current-liability balances'], groups: ['liability.current'], field: 'currentLiabilities' },
  ncl: { title: ['الالتزامات غير المتداولة','Non-current liabilities'], formula: ['عكس إشارة حسابات الالتزامات غير المتداولة','Negative of signed non-current-liability balances'], groups: ['liability.noncurrent'], field: 'nonCurrentLiabilities' },
  liabilities: { title: ['إجمالي الالتزامات','Total liabilities'], formula: ['الالتزامات المتداولة + غير المتداولة','Current + non-current liabilities'], groups: ['liability.current','liability.noncurrent'], field: 'totalLiabilities' },
  equity: { title: ['إجمالي حقوق الملكية','Total equity'], formula: ['حقوق الملكية الافتتاحية + نتيجة الفترة مرة واحدة','Opening equity + current period result, included once'], groups: ['equity',...income], field: 'totalEquity' },
  le: { title: ['الالتزامات وحقوق الملكية','Liabilities and equity'], formula: ['إجمالي الالتزامات + إجمالي حقوق الملكية','Total liabilities + total equity'], groups: ['liability.current','liability.noncurrent','equity',...income], field: 'liabilitiesAndEquity' },
};
export function buildEvidence(key: string, rows: TrialRow[], comparative = false) {
  const definition = definitions[key === 'result' ? 'netProfit' : key];
  const account = rows.find(row => row.accountCode === key);
  if (!definition) return account && !comparative ? { title: [account.name.ar,account.name.en] as Pair, formula: ['عكس إشارة الرصيد الدائن لعرض حقوق الملكية','Credit balance sign reversed for equity presentation'] as Pair, value: subStr('0', account.signedDebitBalance,'USD'), unit: 'USD', rows: [account], comparative: false } : null;
  let value: string | null = calculateFinance(rows)[definition.field];
  if (comparative) {
    const c = source.financialReports.comparative;
    value = definition.field in c ? c[definition.field as keyof typeof c] : key === 'net' ? ratio(c.netProfit,c.netRevenue,true) : key === 'gross' ? ratio(c.grossProfit,c.netRevenue,true) : null;
  }
  return { title: definition.title, formula: definition.formula, value, unit: definition.unit ?? 'USD', rows: comparative ? [] : rows.filter(row => definition.groups.includes(row.classification)), comparative };
}
