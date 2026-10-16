import test from 'node:test';
import assert from 'node:assert/strict';
import type {DistributionRecord} from '../src/types';
import {getDarDistributionGroup, buildCombinedDistributionRows, isCombinedSheetComplete} from '../src/utils/distributionSheetGroup';
const make = (id: string, updates: Partial<DistributionRecord> = {}): DistributionRecord => ({id, distributionNo:id, darReferenceId:'DAR-2026-0001', docNo:'WI-01', revision:'01', distributedDate:'2026-10-16', status:'COMPLETED', targetDepartments:['HR'], allocationByDepartment:{HR:1}, targets:[], receipts:{HR:{dept:'HR',receivedCopies:1,downloadedAt:'2026-10-16T01:00:00Z',downloaderName:'ฝ่ายบุคคล',downloaderEmpId:'',downloaderPosition:'',signatureStoragePath:'signatures/hr.png'}}, ...updates} as DistributionRecord);
test('same DAR combines across document numbers; same document with a different DAR stays separate',()=>{
 const a=make('A'),b=make('B',{docNo:'WI-02'}),c=make('C',{darReferenceId:'DAR-2026-0002'});
 assert.deepEqual(getDarDistributionGroup(a,[c,b,a]).map(r=>r.id),['A','B']);
});
test('missing DAR never groups unrelated records; cancelled history stays separate',()=>{
 const a=make('A',{darReferenceId:''}),b=make('B',{darReferenceId:''});assert.deepEqual(getDarDistributionGroup(a,[a,b]),[a]);
 const c=make('C',{status:'CANCELLED'}),d=make('D');assert.deepEqual(getDarDistributionGroup(d,[c,d]),[d]);assert.deepEqual(getDarDistributionGroup(c,[c,d]),[c]);
});
test('legacy reissue inherits only an explicit parent reference; cycles terminate',()=>{
 const a=make('A'),b=make('B',{darReferenceId:'',reissueOf:'A'});assert.deepEqual(getDarDistributionGroup(b,[a,b]).map(r=>r.id),['A','B']);
 const c=make('C',{darReferenceId:'',reissueOf:'D'}),d=make('D',{darReferenceId:'',reissueOf:'C'});assert.deepEqual(getDarDistributionGroup(c,[c,d]),[c]);
});
test('identical receipt evidence shares one department row with both document references',()=>{
 const a=make('A'),b=make('B');const before=JSON.stringify([a,b]);const rows=buildCombinedDistributionRows([a,b]);assert.equal(rows.length,1);assert.deepEqual(rows[0].documentIndexes,[1,2]);assert.equal(rows[0].copies,1);assert.equal(JSON.stringify([a,b]),before);
});
test('different receipt or return evidence is preserved in separate rows within the same sheet',()=>{
 const a=make('A'),b=make('B',{receipts:{HR:{...make('A').receipts!.HR,downloadedAt:'2026-10-17T01:00:00Z',signatureStoragePath:'signatures/hr-new.png'}}});assert.equal(buildCombinedDistributionRows([a,b]).length,2);
 const c=make('C',{distributionSheet:{receiveRevision:'01',returnRevision:'00',updatedAt:'',updatedBy:'DCC',rows:[{dept:'HR',position:'HR',copies:'1',returnDate:'2026-10-18',returnSignatureStoragePath:'returns/hr.png'}]}});assert.equal(buildCombinedDistributionRows([a,c]).length,2);
});
test('partial receipt cannot make the combined sheet complete',()=>{
 const a=make('A'),b=make('B',{receipts:{},status:'IN_PROGRESS'});assert.equal(isCombinedSheetComplete([a,b]),false);assert.equal(isCombinedSheetComplete([a]),true);assert.equal(isCombinedSheetComplete([]),false);
});
test('cancelled departments are excluded and cannot supply signatures for active departments',()=>{
 const a=make('A',{targetDepartments:['HR','QA/QC'],departmentCancellations:{'QA/QC':{reason:'',cancelledAt:'',cancelledBy:''}}});assert.equal(buildCombinedDistributionRows([a]).length,1);assert.equal(isCombinedSheetComplete([a]),true);
});
