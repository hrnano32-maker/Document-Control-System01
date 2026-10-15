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
