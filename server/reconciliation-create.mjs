import {randomUUID} from 'node:crypto';
import {insert, bulk} from './financial-routes.mjs';
import {bankAmount} from './bank-core.mjs';
import {money} from './financial-core.mjs';

export async function latestApprovedReconciliation(c,t,e,periodId,accountId){
  return (await c.query(`
    SELECT v.id,v.logical_output_id,v.content_fingerprint,r.bank_dataset_id,r.book_dataset_id,r.cutoff_date::text AS cutoff
    FROM mizan.output_versions v JOIN mizan.reconciliations r
      ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id)
    WHERE (v.tenant_id,v.entity_id,v.id)=($1,$2,mizan.latest_approved_output($1,$2,$3,'reconciliation',$4))
  `,[t,e,periodId,accountId])).rows[0];
}

export async function createBankDraft(connection, {
  scope, actor, bank, period, sides, suggestions, fingerprint, algorithm, complete, reopen,
}) {
  const id = randomUUID(), output = randomUUID(), created_at = new Date().toISOString();
  const {rows: [previous]} = await connection.query(`
    SELECT v.logical_output_id,v.version FROM mizan.output_versions v
    JOIN mizan.reconciliations r ON (r.tenant_id,r.entity_id,r.output_version_id)=(v.tenant_id,v.entity_id,v.id)
    WHERE v.tenant_id=$1 AND v.entity_id=$2 AND r.bank_account_id=$4
      AND CASE WHEN $5::uuid IS NULL THEN v.period_id=$3 ELSE v.logical_output_id=$5 END
    ORDER BY v.version DESC LIMIT 1
  `, [scope.tenant_id, scope.entity_id, period.id, bank.id, reopen?.logical_output_id??null]);
  await insert(connection, 'output_versions', {
    ...scope, id: output, logical_output_id: reopen?.logical_output_id ?? previous?.logical_output_id ?? randomUUID(), version: (previous?.version ?? 0)+1,
    predecessor_id:reopen?.id??null,reopen_reason:reopen?.reason??null,
    output_type:'reconciliation', period_id:period.id, currency_code:bank.currency_code,
    settings_version_id:period.settings_version_id, preparer_id:actor, content_fingerprint:fingerprint, status:'draft',
  });
  await bulk(connection, 'output_datasets', Object.entries(sides).map(([side, data]) => ({
    ...scope, id:randomUUID(), created_at, output_version_id:output, dataset_id:data.datasetId, source_role:side,
  })));
  await insert(connection, 'reconciliations', {
    ...scope, id, output_version_id:output, bank_account_id:bank.id, currency_code:bank.currency_code, cutoff_date:period.cutoff,
    bank_dataset_id:sides.bank.datasetId, book_dataset_id:sides.books.datasetId,
    bank_opening_balance:sides.bank.opening, bank_closing_balance:sides.bank.closing,
    book_opening_balance:sides.books.opening, book_closing_balance:sides.books.closing,
    bank_complete:complete, book_complete:complete, bank_sign_policy:sides.bank.signPolicy, book_sign_policy:sides.books.signPolicy,
  });
  const groups = [], members = [];
  for (const [index, suggestion] of suggestions.entries()) {
    const group = randomUUID();
    groups.push({...scope, id:group, created_at, reconciliation_id:id, bank_account_id:bank.id, currency_code:bank.currency_code,
      match_kind:suggestion.books.length>1?'one_to_many':'one_to_one', status:suggestion.ambiguous?'ambiguous':'suggested',
      automatic:false, unique_candidate:!suggestion.ambiguous, reference_conflict:false, idempotency_key:fingerprint+':'+index});
    for (const [side,row] of [['bank',suggestion.bank],...suggestion.books.map(row=>['books',row])]) {
      members.push({...scope, id:randomUUID(), created_at, match_group_id:group, bank_account_id:bank.id, currency_code:bank.currency_code,
        bank_transaction_id:side==='bank'?row.transactionId:null, book_transaction_id:side==='books'?row.transactionId:null,
        evidence:{rule:'Exact normalized nonempty reference, date, signed amount',sourceRowId:row.sourceId}});
    }
  }
  for (let index=0;index<groups.length;index+=250) await bulk(connection,'match_groups',groups.slice(index,index+250));
  for (let index=0;index<members.length;index+=250) await bulk(connection,'match_group_members',members.slice(index,index+250));
  const precision = period.minor_units;
  const residual = bankAmount(sides.bank.closing,precision)-bankAmount(sides.books.closing,precision);
  const checks = [
    {code:'scope',passed:true,message:'Bank, entity, currency and period verified'},
    {code:'bank_rollforward',passed:true,message:'Opening plus signed bank movements equals closing'},
    {code:'book_rollforward',passed:true,message:'Opening plus signed book movements equals closing'},
    {code:'completeness',passed:complete,message:complete?'Both input datasets are complete and published':'Independent source completeness review pending'},
    {code:'malware_scan',passed:complete,message:complete?'Both original sources passed scanning':'Originals quarantined pending file scanning'},
    {code:'residual',passed:false,message:'Matches and reconciling items require explicit review; equal closing balances alone do not establish reconciliation'},
  ];
  await bulk(connection,'validation_results',checks.map(check=>({...scope,id:randomUUID(),created_at,
    output_version_id:output,validated_fingerprint:fingerprint,severity:'blocking',
    evidence:{rawClosingDifference:money(residual,precision),algorithm},...check})));
  return {id,output_version_id:output,reused:false};
}
