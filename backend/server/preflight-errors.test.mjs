import {it,expect} from 'vitest';
import {safePreflightError} from '../verification/preflight-errors.mjs';
it('returns actionable allowlisted diagnostics without service secrets',()=>{
 expect(safePreflightError({code:'28P01',message:'password=secret'})).toContain('28P01');
 for(const error of [null,{}, {code:'secret',message:'password=secret'},{code:'ECONNREFUSED',message:'password=secret'}])expect(safePreflightError(error)).not.toContain('secret');
 expect(safePreflightError({code:'SCANNER_SIGNATURES_STALE'})).toContain('stale');
});
