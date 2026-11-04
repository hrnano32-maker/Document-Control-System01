import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MasterListPrintModal } from '../src/components/MasterListPrintModal';
import { planDarMasterRegistration } from '../src/utils/darMasterRegistration';
import type { DarRecord } from '../src/types';

test('a four-document DAR prints four distinct Master List entries and the same effective date', () => {
  const dar = { id: 'DAR-TEST', status: 'APPROVED', requestType: 'NEW', requestDept: 'HR', docNo: 'WI-TEST-01', docNameTh: 'เอกสาร 1', docNameEn: '', docType: 'WI', currentRevision: 'N/A', proposedRevision: '00', targetEffectiveDate: '2026-11-03', reasonForChange: 'ใหม่', additionalDocuments: [2, 3, 4].map(i => ({ docNo: `WI-TEST-0${i}`, docNameTh: `เอกสาร ${i}`, revision: '00', reason: 'ใหม่' })) } as DarRecord;
  const documents = planDarMasterRegistration(dar, {}, 'DCC', '2026-11-04T00:00:00.000Z', 'register').records;
  const html = renderToStaticMarkup(<MasterListPrintModal documents={documents} selectedType="WI" selectedDept="HR" selectedStatus="ALL" searchQuery="" onClose={() => {}} />);
  for (const item of documents) assert.ok(html.includes(item.docNo));
  assert.equal((html.match(/03\/11\/2026/g) || []).length, 4);
});
