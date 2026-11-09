import {randomUUID} from 'node:crypto';
import {bulk, insert} from './financial-routes.mjs';
import {hash} from './financial-core.mjs';
import {encryptField} from './financial-storage.mjs';
import {checkImportRows} from './import-quality.mjs';
import {materializeBankRows} from './bank-publication.mjs';

export async function materializeImport(connection, {scope, batch, rows, quality, actor, session, basis, bank, HttpError}) {
  const {rows: [previous]} = await connection.query(`
    SELECT d.id,d.logical_dataset_id,d.version FROM mizan.dataset_versions d
    LEFT JOIN mizan.published_bank_balances b ON (b.tenant_id,b.entity_id,b.id)=(d.tenant_id,d.entity_id,d.id)
    WHERE d.tenant_id=$1 AND d.entity_id=$2 AND d.period_id=$3 AND d.data_type=$4
      AND b.bank_account_id IS NOT DISTINCT FROM $5::uuid
    ORDER BY d.version DESC,d.created_at DESC LIMIT 1
  `, [scope.tenant_id, scope.entity_id, batch.period_id, batch.data_type, bank?.accountId ?? null]);
  const id = randomUUID();
  await insert(connection, 'dataset_versions', {
    ...scope, id, logical_dataset_id: previous?.logical_dataset_id ?? randomUUID(),
    version: (previous?.version ?? 0) + 1, predecessor_id: previous?.id ?? null,
    period_id: batch.period_id, currency_code: batch.currency_code, data_type: batch.data_type,
    content_fingerprint: quality.content_fingerprint, status: 'draft', complete_dataset: false,
    idempotency_key: hash('publish-staged:' + batch.id),
  });
  await insert(connection, 'dataset_imports', {...scope, id: randomUUID(), dataset_id: id, import_batch_id: batch.id});
  if (bank) await materializeBankRows(connection, {scope, batch, rows, datasetId: id, bank});
  else await materializeLedgerRows(connection, {scope, batch, rows, datasetId: id, basis, HttpError});
  await connection.query('SELECT mizan_private.publish_staged_dataset($1,$2,$3,$4,$5,$6,$7,$8)',
    [actor, session, scope.tenant_id, scope.entity_id, batch.id, id, quality.id, basis]);
  return id;
}

async function materializeLedgerRows(connection, {scope, batch, rows, datasetId, basis, HttpError}) {
  const trialBalance = batch.data_type === 'trial_balance';
  const codes = rows.map(row => row.values.accountCode);
  const {rows: known} = await connection.query(`
    SELECT id,code,account_type,active FROM mizan.accounts
    WHERE tenant_id=$1 AND entity_id=$2 AND code=ANY($3::text[])
  `, [scope.tenant_id, scope.entity_id, codes]);
  const accounts = new Map(known.map(account => [account.code, account]));
  const created_at = new Date().toISOString();
  const missing = [];
  for (const row of rows) {
    const {accountCode, accountName, classification} = row.values;
    const type = classification?.split('.')[0];
    const existing = accounts.get(accountCode);
    if (existing && (!existing.active || trialBalance && existing.account_type !== type)) {
      throw new HttpError(409, 'ACCOUNT_TYPE_CONFLICT', 'A source account is inactive or has a different classification');
    }
    if (!existing) {
      if (!trialBalance) throw new HttpError(409, 'LEDGER_ACCOUNT_MISSING', 'General ledger rows require existing active accounts');
      const account = {...scope, id: randomUUID(), created_at, code: accountCode, name: accountName, account_type: type, active: true};
      accounts.set(accountCode, account);
      missing.push(account);
    }
  }
  for (let index = 0; index < missing.length; index += 250) await bulk(connection, 'accounts', missing.slice(index, index + 250));
  const records = rows.map(row => {
    const values = row.values;
    const common = {...scope, id: randomUUID(), created_at, dataset_id: datasetId, source_row_id: row.id,
      account_id: accounts.get(values.accountCode).id, currency_code: batch.currency_code};
    if (trialBalance) return {...common, balance_type: basis, opening_balance: values.openingBalance ?? null,
      debit_movement: values.debitMovement ?? null, credit_movement: values.creditMovement ?? null, closing_balance: values.closingBalance};
    return {...common, journal_reference: values.journalReference, line_reference: values.lineReference,
      posting_date: values.postingDate, debit: values.debit, credit: values.credit,
      description_ciphertext: values.description ? encryptField(values.description,
        `ledger-description:${scope.tenant_id}:${scope.entity_id}:${common.id}`) : null};
  });
  const table = trialBalance ? 'trial_balance_rows' : 'ledger_entries';
  for (let index = 0; index < records.length; index += 250) await bulk(connection, table, records.slice(index, index + 250));
}

export function assertPublishable(batch, rows, quality, HttpError) {
  const current = checkImportRows(rows, batch.data_type, batch);
  const fingerprint = hash(JSON.stringify(rows.map(row => [row.id, row.values, Boolean(row.excluded)])));
  if (quality.content_fingerprint !== fingerprint || current.blocking || current.rejected || current.excluded || !current.accepted) {
    throw new HttpError(409, 'IMPORT_VALIDATION_BLOCKED', 'Resolve blocking issues and include every source row before publishing');
  }
}
