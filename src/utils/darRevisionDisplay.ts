import type { DarRecord, DarRequestType } from '../types';
import { revisionKey } from './masterRevisions';

// Legacy additional rows may not have a previous revision. Never guess it.
export function formatDarRevision(requestType: DarRequestType, current?: string, proposed?: string) {
  const before = String(current || '').trim();
  const after = String(proposed || '').trim();
  if (requestType === 'NEW' || !before || before.toUpperCase() === 'N/A') return after;
  return after ? `${before} ➔ ${after}` : `${before} ➔`;
}

// Only used for newly submitted DARs; older DARs may not contain this field.
export function validateAdditionalCurrentRevisions(input: Pick<DarRecord, 'requestType' | 'additionalDocuments'>) {
  if (input.requestType === 'NEW') return;
  for (const [index, row] of (input.additionalDocuments || []).entries()) {
    const oldRev = revisionKey(row.currentRevision || '');
    const newRev = revisionKey(row.revision || '');
    if (!oldRev) throw new Error(`รายการที่ ${index + 2}: กรุณาระบุ Rev. เดิม`);
    if (input.requestType === 'REVISION' && newRev && (oldRev === newRev || (/^\d+$/.test(oldRev) && /^\d+$/.test(newRev) && Number(newRev) <= Number(oldRev)))) {
      throw new Error(`รายการที่ ${index + 2}: Rev. ที่เสนอต้องใหม่กว่า Rev. เดิม`);
    }
  }
}
