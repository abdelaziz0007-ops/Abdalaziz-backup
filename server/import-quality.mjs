import {formatDec, parseDecimal} from '../src/lib/decimal.ts';
import {classifications} from './financial-core.mjs';

const amountFields = {
  trial_balance: ['closingBalance'],
  general_ledger: ['debit', 'credit'],
  bank_statement: ['signedAmount'],
  bank_ledger: ['signedAmount'],
};

export function checkImportRows(rows, dataType, period) {
  const fields = amountFields[dataType];
  const precision = period.minor_units;
  const units = (row, field) => row.values[field] == null ? null : parseDecimal(row.values[field], precision).units;
  const display = value => formatDec({units: value, scale: precision}, precision);
  const included = rows.filter(row => !row.excluded);
  const issues = included.flatMap(row => row.issues);
  const flag = (row, code, message) => issues.push({rowNumber: row?.rowNumber, code, message, severity: 'blocking'});
  const identities = new Map();
  const journals = new Map();
  const bank = ['bank_statement','bank_ledger'].includes(dataType);
  let previousDate = period.start_date;

  for (const row of included) {
    const {values} = row;
    const identity = dataType === 'trial_balance' ? values.accountCode : dataType === 'general_ledger'
      ? values.journalReference && values.lineReference && JSON.stringify([values.journalReference, values.lineReference])
      : values.rowId;
    if (identity) {
      const matches = identities.get(identity) ?? [];
      matches.push(row);
      identities.set(identity, matches);
    }
    if (values.postingDate && (values.postingDate < period.start_date || values.postingDate > period.end_date)) {
      flag(row, 'DATE_OUTSIDE_PERIOD', 'Posting date is outside the selected accounting period');
    }
    if (bank && values.postingDate) {
      if (values.postingDate < previousDate) flag(row, 'BANK_DATE_ORDER', 'Bank rows must be ordered by posting date');
      previousDate = values.postingDate;
      if (units(row, 'signedAmount') === 0n) flag(row, 'BANK_ZERO_MOVEMENT', 'A bank movement cannot be zero');
    }
    if (dataType === 'trial_balance' && !classifications.includes(values.classification)) {
      flag(row, 'CLASSIFICATION_REQUIRED', 'A supported account classification is required');
    }
    if (dataType === 'trial_balance') {
      const opening = units(row, 'openingBalance'), closing = units(row, 'closingBalance');
      const debit = units(row, 'debitMovement'), credit = units(row, 'creditMovement');
      if ((debit !== null && debit < 0n) || (credit !== null && credit < 0n)) {
        flag(row, 'MOVEMENT_SIGN_INVALID', 'Trial-balance debit and credit movements must be nonnegative');
      } else if ([opening, closing, debit, credit].every(value => value !== null) && opening + debit - credit !== closing) {
        flag(row, 'MOVEMENT_BALANCE_MISMATCH', 'Opening balance plus net movement must equal closing balance');
      }
    }
    if (dataType === 'general_ledger' && values.journalReference) {
      const journal = journals.get(values.journalReference) ?? {rows: [], net: 0n, complete: true};
      journal.rows.push(row);
      const debit = units(row, 'debit'), credit = units(row, 'credit');
      if (debit === null || credit === null || row.issues.some(issue => issue.severity === 'blocking')) journal.complete = false;
      else journal.net += debit - credit;
      journals.set(values.journalReference, journal);
    }
  }
  for (const matches of identities.values()) {
    if (matches.length > 1) for (const row of matches) flag(row, 'DUPLICATE_ROW_IDENTITY', 'A row identity occurs more than once');
  }
  for (const journal of journals.values()) {
    if (!journal.complete || journal.net !== 0n) {
      for (const row of journal.rows) flag(row, 'JOURNAL_UNBALANCED', 'The journal has incomplete or unequal debit and credit amounts');
    }
  }
  if (!included.length) flag(null, 'IMPORT_EMPTY', 'At least one included row is required');
  if (dataType === 'trial_balance' && included.length
      && included.every(row => units(row, 'closingBalance') !== null)
      && included.reduce((sum, row) => sum + units(row, 'closingBalance'), 0n) !== 0n) {
    flag(null, 'TRIAL_BALANCE_UNBALANCED', 'Signed closing balances must sum to zero');
  }

  const blocked = new Set(issues.filter(issue => issue.severity === 'blocking').map(issue => issue.rowNumber));
  const accepted = included.filter(row => !blocked.has(row.rowNumber));
  const totals = (group, original = false) => Object.fromEntries(fields.map(field => {
    let amount = 0n, missing = 0;
    for (const row of group) {
      const value = units(original && row.originalValues ? {values: row.originalValues} : row, field);
      if (value === null) missing++;
      else amount += value;
    }
    return [field, {amount: display(amount), missing}];
  }));
  return {
    recordsRead: rows.length, accepted: accepted.length, rejected: included.length - accepted.length,
    excluded: rows.length - included.length, blocking: issues.filter(issue => issue.severity === 'blocking').length,
    totalsBefore: totals(rows, true), totalsAfter: totals(accepted), issues, blocked,
  };
}
