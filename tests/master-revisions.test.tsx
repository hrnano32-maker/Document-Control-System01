import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DarRecord, MasterDocument, RevisionHistoryItem } from '../src/types';
import { MasterListPrintModal } from '../src/components/MasterListPrintModal';
import { getMasterRevisionHistory, getMasterRevisionColumnGroups, hasMissingRevisionDates, validateMasterRevisionDates } from '../src/utils/masterRevisions';

const row = (rev: string, effectiveDate: string): RevisionHistoryItem => ({ rev, effectiveDate, darNo: 'DAR-test', reason: '', registeredBy: 'DCC', registeredDate: '2026-10-15', status: 'ACTIVE', controlledDriveLink: '' });
const master: MasterDocument = { id: 'WI-PD2-004', docNo: 'WI-PD2-004', docNameTh: 'เอกสารทดสอบทะเบียน', docNameEn: '', docType: 'WI', ownerDept: 'Production 2/3', currentRevision: '05', effectiveDate: '2026-10-16', reviewDueDate: '2027-10-15', status: 'ACTIVE', darReferenceId: 'DAR-test', revisionHistory: [row('05', '2026-10-16')], createdAt: '', updatedAt: '', retentionPeriodYears: 5 };
const dar = { id: 'DAR-test', docNo: master.docNo, status: 'REGISTERED', requestType: 'REVISION', currentRevision: '04', proposedRevision: '05', previousEffectiveDate: '2026-01-23', targetEffectiveDate: '2026-10-16' } as DarRecord;

test('print dates under matching revision numbers, even with only one saved revision', () => {
  const document = { ...master, revisionHistory: getMasterRevisionHistory(master, dar) };
  const html = renderToStaticMarkup(<MasterListPrintModal documents={[document]} selectedType="WI" selectedDept="ALL" selectedStatus="ALL" searchQuery="" onClose={() => {}} />);
  assert.match(html, /data-revision="01"[^>]*><\/td>/);
  assert.match(html, /data-revision="04"[^>]*>23\/01\/2026<\/td>/);
  assert.match(html, /data-revision="05"[^>]*>16\/10\/2026<\/td>/);
});

test('restore only missing dates from the matching registered DAR', () => {
  const history = getMasterRevisionHistory(master, dar);
  assert.deepEqual(history.map(item => [item.rev, item.effectiveDate]), [['04', '2026-01-23'], ['05', '2026-10-16']]);
  assert.equal(hasMissingRevisionDates(master, dar), true);
  assert.equal(hasMissingRevisionDates({ ...master, revisionHistory: history }, dar), false);
  for (const invalid of [{ ...dar, id: 'other' }, { ...dar, docNo: 'other' }, { ...dar, proposedRevision: '06' }, { ...dar, status: 'APPROVED' as const }]) {
    assert.equal(getMasterRevisionHistory(master, invalid).length, 1);
  }
});

test('a DCC-corrected historical date takes precedence over its old DAR value', () => {
  const corrected = { ...master, revisionHistory: [row('04', '2026-02-01'), row('05', '2026-10-16')] };
  assert.equal(getMasterRevisionHistory(corrected, dar).find(item => item.rev === '04')?.effectiveDate, '2026-02-01');
  assert.equal(hasMissingRevisionDates(corrected, dar), false);
});

test('the initial Rev.00 starts the same table as Rev.01 through Rev.05', () => {
  const document = { ...master, currentRevision: '00', effectiveDate: '2026-09-30', revisionHistory: [row('0', '2026-09-30')] };
  const expected = ['00', '01', '02', '03', '04', '05'];
  assert.deepEqual(getMasterRevisionColumnGroups([]), [expected]);
  const html = renderToStaticMarkup(<MasterListPrintModal documents={[document, master]} selectedType="ALL" selectedDept="ALL" selectedStatus="ALL" searchQuery="" onClose={() => {}} />);
  assert.equal((html.match(/<table\b/g) || []).length, 1);
  assert.deepEqual([...html.matchAll(/<th\b[^>]*>Rev\. (\d+)<\/th>/g)].map(match => match[1]), expected);
  const firstRow = html.split('<tbody>')[1].split('</tr>')[0];
  assert.match(firstRow, /data-revision="00"[^>]*>30\/09\/2026<\/td>/);
  assert.match(firstRow, /data-revision="01"[^>]*><\/td>/);
  assert.doesNotMatch(html, /ประวัติ Revision เพิ่มเติม/);
});

test('revisions above 05 continue in numerical order in the same table', () => {
  const document = { ...master, revisionHistory: Array.from({ length: 13 }, (_, index) => row(String(index).padStart(2, '0'), '2026-01-01')) };
  const expected = Array.from({ length: 13 }, (_, index) => String(index).padStart(2, '0'));
  assert.deepEqual(getMasterRevisionColumnGroups([document]), [expected]);
  const html = renderToStaticMarkup(<MasterListPrintModal documents={[document]} selectedType="ALL" selectedDept="ALL" selectedStatus="ALL" searchQuery="" onClose={() => {}} />);
  assert.equal((html.match(/<table\b/g) || []).length, 1);
  assert.deepEqual([...html.matchAll(/<th\b[^>]*>Rev\. (\d+)<\/th>/g)].map(match => match[1]), expected);
});

test('reject invalid calendar dates, reversed revisions and premature review dates', () => {
  assert.throws(() => validateMasterRevisionDates([row('04', '2026-10-17'), row('05', '2026-10-16')], '', '05'), /ต้องก่อน/);
  assert.throws(() => validateMasterRevisionDates([row('04', '2026-02-30')], '', '04'), /ไม่ถูกต้อง/);
  assert.throws(() => validateMasterRevisionDates([row('05', '2026-10-16')], '2026-01-01', '05'), /ทบทวน/);
  validateMasterRevisionDates(getMasterRevisionHistory(master, dar), '2027-10-15', '05');
});

test('printed Master List keeps the old and current dates for each verified K006, K007 and K009 pair', () => {
  const codes = ['006', '007', '009'];
  const ids = codes.map(n => 'BOM-K'+n+'-01_51');
  const sources = codes.map((n,i): MasterDocument => ({
    ...master, id: 'BOM_API-'+n+'-26', docNo:'BOM_API-'+n+'-26', currentRevision:'00',
    revisionHistory:[], effectiveDate:'2026-11-17', darReferenceId:'DAR-2026-0028',
    status:'OBSOLETE', supersededByDocumentId:ids[i], supersededByDocNo:ids[i], renumberedByDarId:'DAR-2026-0033',
  }));
  const revisionDar: DarRecord = {...dar, id:'DAR-2026-0033', docNo:ids[0], currentRevision:'00', proposedRevision:'01',
    previousEffectiveDate:'2026-11-17', targetEffectiveDate:'2026-11-20',
    additionalDocuments: [2,1].map(i => ({docNo:ids[i], docNameTh:'BOM', revision:'01', reason:'แก้ไข'})),
  };
  const targets = ids.map((id,i): MasterDocument => ({...master, id, docNo:id, darReferenceId:revisionDar.id, currentRevision:'01',
    effectiveDate:'2026-11-20', revisionHistory:[row('01','2026-11-20')], previousDocumentId:sources[i].id,
    previousDocNo:sources[i].docNo, renumberedByDarId:revisionDar.id,
  }));
  const docs = targets.map((m,i) => ({...m,revisionHistory:getMasterRevisionHistory(m,revisionDar,sources[i])}));
  const html = renderToStaticMarkup(<MasterListPrintModal documents={[...sources,...docs]} selectedType="ALL" selectedDept="ALL" selectedStatus="ALL" searchQuery="" onClose={()=>{}}/>);
  const rows = html.split('<tbody>')[1].split('</tbody>')[0].split('</tr>').filter(Boolean);
  assert.equal(rows.length,6);
  for (const id of ids) {
    const printed = rows.find(r => r.includes('>'+id+'</td>'));
    assert.ok(printed);assert.match(printed,/data-revision="00"[^>]*>17\/11\/2026<\/td>/);
    assert.match(printed,/data-revision="01"[^>]*>20\/11\/2026<\/td>/);
  }
  // No DAR needed for a recipient who only sees the authorized Master history.
  assert.equal(getMasterRevisionHistory(targets[1], undefined, sources[1])[0].effectiveDate,'2026-11-17');
  for (const unverified of [sources[2],{...sources[1],supersededByDocumentId:ids[0]},{...sources[1],renumberedByDarId:'OTHER'}])
    assert.deepEqual(getMasterRevisionHistory(targets[1],revisionDar,unverified).map(r=>r.rev),['01']);
  const corrected = {...targets[1], revisionHistory:[...targets[1].revisionHistory,row('00','2026-11-16')]};
  assert.equal(getMasterRevisionHistory(corrected,revisionDar,sources[1])[0].effectiveDate,'2026-11-16');
});

test('additional DAR rows supply only their own prior revision/date, never the primary or a sibling date', () => {
  const additional = {...master,id:'WI-2',docNo:'WI-2'};
  const extra = {docNo:'WI-2',docNameTh:'ทดสอบ',currentRevision:'03',revision:'05',previousEffectiveDate:'2026-02-12',reason:'แก้ไข'};
  const multi = {...dar,additionalDocuments:[{...extra,docNo:'WI-3',previousEffectiveDate:'2026-01-01'},extra]};
  assert.deepEqual(getMasterRevisionHistory(additional,multi).map(r=>[r.rev,r.effectiveDate]),[['03','2026-02-12'],['05','2026-10-16']]);
  for (const row of [{...extra,currentRevision:undefined},{...extra,previousEffectiveDate:undefined},{...extra,revision:'06'}])
    assert.deepEqual(getMasterRevisionHistory(additional,{...dar,additionalDocuments:[row]}).map(r=>r.rev),['05']);
  assert.deepEqual(getMasterRevisionHistory(additional,{...dar,additionalDocuments:[extra,extra]}).map(r=>r.rev),['05']);
});
