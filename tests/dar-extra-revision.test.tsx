import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DarLivePreview } from '../src/components/DarLivePreview';
import { formatDarRevision, validateAdditionalCurrentRevisions } from '../src/utils/darRevisionDisplay';
import { planDarMasterRegistration } from '../src/utils/darMasterRegistration';
import { sameDarCorrectionValue } from '../src/utils/darCorrection';
import type { DarRecord, MasterDocument } from '../src/types';

const row = { docNo: 'WI-HR-02', docNameTh: 'เอกสารลำดับสอง', currentRevision: '03', revision: '04', previousEffectiveDate: '2025-01-01', reason: 'ปรับปรุง' };

test('each row displays its own previous and proposed revision; legacy and new DARs do not invent a prior revision', () => {
  assert.equal(formatDarRevision('REVISION', '03', '04'), '03 ➔ 04');
  assert.equal(formatDarRevision('REVISION', undefined, '04'), '04');
  assert.equal(formatDarRevision('NEW', 'N/A', '00'), '00');
  const html = renderToStaticMarkup(<DarLivePreview requestType="REVISION" requestDept="HR" requesterName="HR" targetEffectiveDate="2026-01-01" previousEffectiveDate="2025-01-01" docNo="WI-HR-01" docNameTh="เอกสารลำดับหนึ่ง" docNameEn="" docType="WI" currentRevision="01" proposedRevision="02" reasonForChange="ปรับปรุง" additionalDocuments={[row]} approverName="HR" approverDate="2025-01-01" distributionHolders={[]} />);
  assert.match(html, /01 ➔ 02/);
  assert.match(html, /03 ➔ 04/);
});

test('new submissions require an old revision for each revision row and reject non-increasing revisions', () => {
  assert.doesNotThrow(() => validateAdditionalCurrentRevisions({ requestType: 'REVISION', additionalDocuments: [row] }));
  assert.throws(() => validateAdditionalCurrentRevisions({ requestType: 'REVISION', additionalDocuments: [{ ...row, currentRevision: '' }] }), /รายการที่ 2.*Rev. เดิม/);
  assert.throws(() => validateAdditionalCurrentRevisions({ requestType: 'REVISION', additionalDocuments: [{ ...row, currentRevision: '04' }] }), /ต้องใหม่กว่า/);
  assert.doesNotThrow(() => validateAdditionalCurrentRevisions({ requestType: 'NEW', additionalDocuments: [{ ...row, currentRevision: undefined, revision: '00' }] }));
  assert.throws(() => validateAdditionalCurrentRevisions({ requestType: 'OBSOLETE', additionalDocuments: [{ ...row, currentRevision: 'N/A' }] }), /Rev. เดิม/);
});

test('registration verifies the prior revision of the matching Master document without breaking legacy DARs', () => {
  const dar = { id:'DAR-TEST', status:'APPROVED', requestType:'REVISION', requestDept:'HR', docNo:'WI-HR-01', docNameTh:'เอกสารหนึ่ง', docNameEn:'', docType:'WI', currentRevision:'01', proposedRevision:'02', targetEffectiveDate:'2026-01-01', previousEffectiveDate:'2025-01-01', reasonForChange:'ปรับปรุง', additionalDocuments:[row] } as DarRecord;
  const base = { id:'WI-HR-02', docNo:'WI-HR-02', docNameTh:'เอกสารสอง', docNameEn:'', docType:'WI', ownerDept:'HR', status:'ACTIVE', currentRevision:'03', effectiveDate:'2025-01-01', darReferenceId:'DAR-OLD', createdAt:'2025-01-01', updatedAt:'2025-01-01', reviewDueDate:'2026-01-01', revisionHistory:[], retentionPeriodYears:5 } as MasterDocument;
  const previous = { 'WI-HR-02': base };
  const result = planDarMasterRegistration(dar, previous, 'DCC', '2025-10-01T00:00:00.000Z', 'register');
  assert.equal(result.records[1].currentRevision, '04');
  assert.throws(() => planDarMasterRegistration({ ...dar, additionalDocuments:[{ ...row, currentRevision:'02' }] }, previous, 'DCC', '2025-10-01T00:00:00.000Z', 'register'), /Rev. เดิมไม่ตรง/);
  assert.doesNotThrow(() => planDarMasterRegistration({ ...dar, additionalDocuments:[{ ...row, currentRevision:undefined }] }, previous, 'DCC', '2025-10-01T00:00:00.000Z', 'register'));
  assert.equal(sameDarCorrectionValue('additionalDocuments', [{ ...row, currentRevision: undefined }], [{ ...row, currentRevision: '' }]), true);
});
