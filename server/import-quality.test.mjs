import {expect, it} from 'vitest';
import {checkImportRows} from './import-quality.mjs';

const period = {minor_units: 3, start_date: '2026-01-01', end_date: '2026-01-31'};

it('requires balanced individual journals even when the aggregate debit and credit match', () => {
  const rows = [
    {rowNumber: 2, values: {journalReference: 'A', lineReference: '1', debit: '1.001', credit: '0.000'}, issues: []},
    {rowNumber: 3, values: {journalReference: 'B', lineReference: '1', debit: '0.000', credit: '1.001'}, issues: []},
  ];
  const quality = checkImportRows(rows, 'general_ledger', period);
  expect(quality.rejected).toBe(2);
  expect(quality.issues.map(issue => issue.code)).toEqual(['JOURNAL_UNBALANCED', 'JOURNAL_UNBALANCED']);
});

it('keeps exact original totals and missing counts after corrections and exclusions', () => {
  const rows = [
    {rowNumber: 2, values: {rowId: 'a', signedAmount: '9007199254740993.002'}, originalValues: {signedAmount: '9007199254740993.001'}, issues: []},
    {rowNumber: 3, values: {rowId: 'b', signedAmount: '0.010'}, excluded: true, issues: []},
    {rowNumber: 4, values: {rowId: 'c'}, issues: [{rowNumber: 4, code: 'INVALID_AMOUNT', severity: 'blocking'}]},
  ];
  const quality = checkImportRows(rows, 'bank_statement', period);
  expect(quality).toMatchObject({recordsRead: 3, accepted: 1, rejected: 1, excluded: 1,
    totalsBefore: {signedAmount: {amount: '9007199254740993.011', missing: 1}},
    totalsAfter: {signedAmount: {amount: '9007199254740993.002', missing: 0}},
  });
});
