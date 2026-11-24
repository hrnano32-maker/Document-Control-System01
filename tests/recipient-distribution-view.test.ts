import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import { getRecipientGate } from '../src/utils/distributionAccess';

// Render the real gate and distribution history. Only the account and remote I/O are replaced.
test('department history has no expired-receipt prompt; a pending delivery instead has one mandatory action or a waiting status', async () => {
  const ctx: any = { currentUser:{uid:'hr',userRole:'STAFF',currentDept:'HR'},distributions:[],documentReturns:[],reRequests:[],distributionSync:'ready' };
  const result = await build({ stdin:{contents:`
    import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
    import {DistributionManager} from './src/components/DistributionManager';
    import {PendingDistributionGate} from './src/components/PendingDistributionGate';
    export function render(gate){return renderToStaticMarkup(gate.blocked ? <PendingDistributionGate gate={gate}/> : <DistributionManager/>);}
    `,loader:'tsx',resolveDir:process.cwd()},bundle:true,platform:'node',packages:'external',format:'cjs',write:false,jsx:'automatic',plugins:[{name:'account',setup(b){
      b.onResolve({filter:/context\/DcsContext$/},()=>({path:'ctx',namespace:'mock'}));
      b.onResolve({filter:/(lib\/firebase|services\/dcsRepository)$/},()=>({path:'io',namespace:'mock'}));
      b.onLoad({filter:/.*/,namespace:'mock'},arg=>({contents:arg.path==='ctx'?'export const useDcs=()=>globalThis.account':'export const firebaseFunctions={};export const confirmDocumentReturn=()=>{};export const syncDocumentReturnRequests=()=>{};'}));
    }}] });
  const scope = {account:ctx,module:{exports:{} as any},require:createRequire(import.meta.url),Date,console};
  vm.runInNewContext(result.outputFiles[0].text,scope);
  const draw = () => scope.module.exports.render(getRecipientGate(ctx.currentUser,'ready',ctx.distributions,[]));
  const item = {id:'DC-TEST',distributionNo:'DC-TEST',docNo:'WI-01',docNameTh:'ขั้นตอนทดสอบ',revision:'01',status:'EXPIRED',expirationEpoch:1,targetDepartments:['HR'],targets:[{dept:'HR',isDownloaded:true}],departmentFileNames:{HR:['a.pdf','b.pdf']},receipts:{} as any};
  ctx.distributions=[item];
  assert.match(draw(),/ร้องขอ DCC เปิดสิทธิ์ใหม่/);
  ctx.reRequests=[{id:'REQ',distributionId:item.id,dept:'HR',status:'PENDING'}];
  assert.match(draw(),/ส่งคำร้องแล้ว · รอ DCC/);assert.doesNotMatch(draw(),/>ร้องขอ DCC เปิดสิทธิ์ใหม่</);
  ctx.reRequests=[];item.receipts.HR={downloadedAt:'2026-11-01T01:00:00Z',transferId:'t',transferStatus:'COMPLETE',transferCompletedAt:'2026-11-01T01:01:00Z',transferredIndexes:[0]};
  assert.match(draw(),/ไม่มีหลักฐานว่าบันทึกครบทุกไฟล์/);
  item.receipts.HR.transferredIndexes=[0,1];item.targets[0].isDownloaded=false;
  const html=draw();assert.match(html,/ประวัติการรับ · ดาวน์โหลดครบแล้ว/);assert.doesNotMatch(html,/ร้องขอ DCC เปิดสิทธิ์ใหม่|สิทธิ์ดาวน์โหลดของแผนกหมดอายุแล้ว/);
  assert.match(html,/<details[^>]*><summary[^>]*>กรณีไฟล์ที่รับแล้วสูญหายหรือชำรุด<\/summary><button[^>]*>ขอสำเนาทดแทน<\/button><\/details>/);
});
