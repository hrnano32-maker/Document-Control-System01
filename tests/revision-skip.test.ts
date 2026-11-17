import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRevisionSequence, getNextRevision, getSkippedRevisionFields, parseRevisionNumber } from '../src/utils/revisionHelper';
import type { MasterDocument } from '../src/types';

test('customer-style revisions retain punctuation and never fabricate skipped integer revisions', () => {
  assert.equal(parseRevisionNumber('5.2'), null);
  assert.equal(parseRevisionNumber('Rev.7.0'), null);
  assert.equal(parseRevisionNumber('A1'), null);
  assert.equal(getNextRevision('5.2'), '');
  const result = analyzeRevisionSequence('CUSTOMER-01', 'REVISION', '5.2', '7.0', []);
  assert.equal(result.isSkipped, false);
  assert.deepEqual(result.skippedRevs, []);
  assert.doesNotMatch(result.warningMessage, /Rev\.53|Rev\.69/);
  assert.deepEqual(getSkippedRevisionFields('REVISION', result.isSkipped, ' ลูกค้ากำหนดฉบับใหม่ '), {
    isSkippedRevision: true, skippedRevisionReason: 'ลูกค้ากำหนดฉบับใหม่',
  });
});

test('integer revision jumps require a reason and ordinary consecutive revisions remain unchanged', () => {
  assert.equal(parseRevisionNumber('Rev.02'), 2);
  assert.equal(getNextRevision('02'), '03');
  const result = analyzeRevisionSequence('WI-01', 'REVISION', '02', '05', []);
  assert.equal(result.isSkipped, true);
  assert.deepEqual(result.skippedRevs, ['03', '04']);
  assert.throws(() => getSkippedRevisionFields('REVISION', result.isSkipped, '  '), /เหตุผล/);
  assert.deepEqual(getSkippedRevisionFields('REVISION', true, 'เหตุผล'), { isSkippedRevision: true, skippedRevisionReason: 'เหตุผล' });
  assert.equal(analyzeRevisionSequence('WI-01', 'REVISION', '02', '03', []).isSkipped, false);
  assert.equal(analyzeRevisionSequence('WI-01', 'NEW', 'N/A', '00', []).isSkipped, false);
  assert.equal(analyzeRevisionSequence('WI-01', 'NEW', 'N/A', '02', []).isSkipped, true);
});

test('a decimal revision in Master List is not replaced by an invented integer baseline', () => {
  const master = { docNo: 'CUSTOMER-01', currentRevision: '5.2' } as MasterDocument;
  const result = analyzeRevisionSequence('CUSTOMER-01', 'REVISION', '5.2', '7.0', [master]);
  assert.equal(result.isSkipped, false);
  assert.equal(result.systemCurrentRev, '5.2');
  assert.equal(result.expectedProposedRev, '');
  assert.deepEqual(result.skippedRevs, []);
});

test('large revision jumps do not generate an unbounded warning', () => {
  const result = analyzeRevisionSequence('WI-01', 'REVISION', '01', '1000000', []);
  assert.equal(result.isSkipped, true);
  assert.equal(result.skippedRevs.length, 20);
  assert.match(result.warningMessage, /อีก/);
});

test('obsolete requests and ordinary requests do not retain old skip justifications', () => {
  assert.deepEqual(getSkippedRevisionFields('OBSOLETE', false, 'ข้อความเก่า'), { isSkippedRevision: false, skippedRevisionReason: undefined });
  assert.deepEqual(getSkippedRevisionFields('REVISION', false, ''), { isSkippedRevision: false, skippedRevisionReason: undefined });
});
