import {describe,it,expect} from 'vitest';
import {groupedSuggestions,groupedLimits} from './grouped-suggestions.mjs';
const row=(id,amount,extra={})=>({id,signed_amount:amount,remaining_amount:amount.replace('-',''),posting_date:'2026-11-10',reference_hash:'same',...extra});
describe('grouped match suggestions',()=>{
 it('finds exact one-to-many and reverse groups without confirmation',()=>{
  const bank=[row('a','100.00')],books=[row('b','40.00'),row('c','60.00')];
  const result=groupedSuggestions(bank,books,2);expect(result.suggestions).toHaveLength(1);expect(result.suggestions[0]).toMatchObject({kind:'one_to_many',total:'100.00',residual:'0.00',requiresReview:true});
  expect(groupedSuggestions(books,bank,2).suggestions[0].kind).toBe('many_to_one');
 });
 it('uses unallocated capacity and supports outflows',()=>{
  const result=groupedSuggestions([row('a','-120.00',{remaining_amount:'100.00'})],[row('b','-40.00'),row('c','-80.00',{remaining_amount:'60.00'})],2);
  expect(result.suggestions[0].pairs.map(p=>p.amount)).toEqual(['40.00','60.00']);
 });
 it.each([{reference_hash:null},{reference_hash:'different'},{posting_date:'2026-11-09'},{signed_amount:'-60.00'}])('does not cross rule boundaries %s',extra=>{
  expect(groupedSuggestions([row('a','100.00')],[row('b','40.00'),row('c','60.00',extra)],2).suggestions).toEqual([]);
 });
 it('retains alternative overlapping groups for human review',()=>{
  expect(groupedSuggestions([row('a','100')],[row('b','40'),row('c','60'),row('d','60')],0).suggestions).toHaveLength(2);
 });
 it('preserves values beyond floating point precision',()=>{
  const result=groupedSuggestions([row('a','9007199254740993.001')],[row('b','9007199254740993.000'),row('c','0.001')],3);
  expect(result.suggestions[0].total).toBe('9007199254740993.001');
 });
 it('discloses candidate and row truncation',()=>{
  const result=groupedSuggestions([row('a','100')],Array.from({length:1001},(_,i)=>row(String(i).padStart(4,'0'),'1')),0);
  expect(result.searchComplete).toBe(false);expect(result.unsearchedReasons).toContain('row_limit');expect(result.unsearchedReasons).toContain('candidate_limit');expect(result.states).toBeLessThanOrEqual(groupedLimits.states);
 });
 it('bounds expensive search and reports omitted groups',()=>{
  const result=groupedSuggestions(Array.from({length:100},(_,i)=>row('a'+i,'50')),Array.from({length:12},(_,i)=>row('b'+i,'1')),0);
  expect(result.states).toBeLessThanOrEqual(groupedLimits.states);expect(result.unsearchedReasons).toContain('search_budget');expect(result.unsearchedReasons).toContain('group_size_limit');
 });
 it('does not mutate source movements',()=>{
  const bank=[row('a','100')],books=[row('b','40'),row('c','60')],before=JSON.stringify({bank,books});groupedSuggestions(bank,books,0);expect(JSON.stringify({bank,books})).toBe(before);
 });
});
