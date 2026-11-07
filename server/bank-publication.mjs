import {createHmac, randomUUID} from 'node:crypto';
import {bankAmount} from './bank-core.mjs';
import {money} from './financial-core.mjs';
import {encryptField} from './financial-storage.mjs';
import {bulk, insert} from './financial-routes.mjs';

export const isBankImport = type => ['bank_statement', 'bank_ledger'].includes(type);

export function checkBankBalances(rows, period, opening, closing, HttpError) {
  const precision = period.minor_units;
  const openingUnits = bankAmount(opening, precision), closingUnits = bankAmount(closing, precision);
  let balance = openingUnits;
  let previousDate = period.start_date;
  for (const {rowNumber, values} of rows) {
    if (values.postingDate < previousDate || values.postingDate > period.end_date) {
      throw new HttpError(422, 'BANK_DATE_ORDER', `Row ${rowNumber}: bank posting dates must be ordered within the period`);
    }
    const units = bankAmount(values.signedAmount, precision);
    if (units === 0n) throw new HttpError(422, 'BANK_ZERO_MOVEMENT', `Row ${rowNumber}: a bank movement cannot be zero`);
    balance += units;
    bankAmount(money(balance, precision), precision);
    if (values.runningBalance != null && bankAmount(values.runningBalance, precision) !== balance) {
      throw new HttpError(422, 'BANK_RUNNING_BALANCE_MISMATCH', `Row ${rowNumber}: running balance does not match the movements`);
    }
    previousDate = values.postingDate;
  }
  if (balance !== closingUnits) {
    throw new HttpError(422, 'BANK_CLOSING_BALANCE_MISMATCH', 'Opening balance plus movements must equal closing balance');
  }
  return {opening: money(openingUnits, precision), closing: money(closingUnits, precision)};
}

export async function bankPublicationDetails(connection, {scope, batch, rows, bank, actor, HttpError}) {
  const {rows: [account]} = await connection.query(`
    SELECT id,currency_code,mizan.has_permission($1,$2,$4,'imports.manage',id) AS allowed
    FROM mizan.bank_accounts WHERE tenant_id=$1 AND entity_id=$2 AND id=$3 AND active
  `, [scope.tenant_id, scope.entity_id, bank.accountId, actor]);
  if (!account || !account.allowed) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Bank account not found in this scope');
  if (account.currency_code !== batch.currency_code) {
    throw new HttpError(422, 'BANK_CURRENCY_MISMATCH', 'Bank account currency must match the accounting period');
  }
  if (rows.length > 1000) throw new HttpError(422, 'BANK_PUBLICATION_LIMIT', 'Bank publication supports up to 1000 transactions per side');
  return {accountId: account.id, signPolicy: bank.signPolicy, ...checkBankBalances(rows, batch, bank.opening, bank.closing, HttpError)};
}

export async function materializeBankRows(connection, {scope, batch, rows, datasetId, bank}) {
  const created_at = new Date().toISOString();
  const context = `${scope.tenant_id}:${scope.entity_id}:${bank.accountId}:transaction`;
  const table = batch.data_type === 'bank_statement' ? 'bank_transactions' : 'book_transactions';
  for (let index = 0; index < rows.length; index += 250) {
    await bulk(connection, table, rows.slice(index, index + 250).map(row => {
      const values = row.values, reference = values.reference ?? '';
      const referenceHash = reference ? createHmac('sha256', process.env.SOURCE_ENCRYPTION_KEY)
        .update(bank.accountId + ':' + reference.normalize('NFKC').trim().toUpperCase()).digest('hex') : null;
      return {...scope, id: randomUUID(), created_at, dataset_id: datasetId, source_row_id: row.id,
        bank_account_id: bank.accountId, currency_code: batch.currency_code, posting_date: values.postingDate,
        reference_hash: referenceHash, reference_ciphertext: encryptField(reference, context),
        description_ciphertext: encryptField(values.description ?? '', context),
        signed_amount: values.signedAmount, running_balance: values.runningBalance ?? null};
    }));
  }
  await insert(connection, 'published_bank_balances', {...scope, id: datasetId, bank_account_id: bank.accountId,
    currency_code: batch.currency_code, opening_balance: bank.opening, closing_balance: bank.closing, sign_policy: bank.signPolicy});
}
