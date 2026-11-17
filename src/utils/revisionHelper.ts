import { MasterDocument, DarRequestType } from '../types';

export interface RevisionAnalysisResult {
  isSkipped: boolean;
  isMismatchWithMaster: boolean;
  systemDoc: MasterDocument | null;
  systemCurrentRev: string | null;
  expectedProposedRev: string;
  proposedNum: number | null;
  currentNum: number | null;
  skippedRevs: string[];
  warningMessage: string;
  dccPrompt: string;
}

/**
 * Parse revision string to integer safely
 * Examples: "00" -> 0, "01" -> 1, "03" -> 3, "Rev.02" -> 2
 */
export function parseRevisionNumber(rev: string): number | null {
  const cleaned = String(rev || '').trim().replace(/^rev(?:ision)?\.?\s*/i, '');
  // Customer revisions such as 5.2 or A1 are identifiers, not integers 52/1.
  if (!/^\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Format integer back to standard two-digit revision string (e.g. 1 -> "01", 0 -> "00")
 */
export function formatRevision(num: number): string {
  if (num < 0) return '00';
  return String(num).padStart(2, '0');
}

/**
 * Get next expected sequential revision string
 */
export function getNextRevision(currentRev: string): string {
  const num = parseRevisionNumber(currentRev);
  if (num === null) return !currentRev || /^(?:n\/a|-)$/i.test(currentRev.trim()) ? '00' : '';
  return formatRevision(num + 1);
}

// Customer numbering cannot always be ordered automatically. Entering a reason
// explicitly records the requester's declaration for DCC review.
export function getSkippedRevisionFields(reqType: DarRequestType, detectedSkip: boolean, reason: string) {
  const trimmed = reason.trim();
  if (reqType === 'OBSOLETE') return { isSkippedRevision: false, skippedRevisionReason: undefined };
  if (detectedSkip && !trimmed) throw new Error('กรุณาระบุเหตุผลกรณีข้าม Revision');
  return { isSkippedRevision: detectedSkip || Boolean(trimmed), skippedRevisionReason: trimmed || undefined };
}

/**
 * Comprehensive Revision Sequence & Master List Synchronization Validator
 */
export function analyzeRevisionSequence(
  docNo: string,
  reqType: DarRequestType,
  currentRev: string,
  proposedRev: string,
  masterDocuments: MasterDocument[]
): RevisionAnalysisResult {
  const normalizedDocNo = (docNo || '').trim().toUpperCase();
  const systemDoc = masterDocuments.find(
    d => d.docNo.trim().toUpperCase() === normalizedDocNo
  ) || null;

  const systemCurrentRev = systemDoc ? systemDoc.currentRevision : null;
  const sysCurrentNum = systemCurrentRev ? parseRevisionNumber(systemCurrentRev) : null;
  const formCurrentNum = parseRevisionNumber(currentRev);
  const formProposedNum = parseRevisionNumber(proposedRev);

  let isSkipped = false;
  let isMismatchWithMaster = false;
  let expectedProposedRev = '01';
  const skippedRevs: string[] = [];
  let warningMessage = '';
  let dccPrompt = '';
  const listSkipped = (first: number, end: number) => {
    // Keep the warning readable even when a user types a very large revision.
    for (let i = first; i < Math.min(end, first + 20); i++) skippedRevs.push(formatRevision(i));
    return skippedRevs.join(', Rev.') + (end - first > 20 ? ` และอีก ${end - first - 20} ฉบับ` : '');
  };

  if (reqType === 'NEW') {
    expectedProposedRev = '00';
    if (formProposedNum !== null && formProposedNum > 0) {
      isSkipped = true;
      const skipped = listSkipped(0, formProposedNum);
      warningMessage = `จัดทำเอกสารใหม่ (NEW) ตามมาตรฐานควรเริ่มต้นที่ Rev.00 แต่ท่านระบุเป็น Rev.${proposedRev} (ข้าม Rev.${skipped})`;
      dccPrompt = 'กรุณาติดต่อเจ้าหน้าที่ควบคุมเอกสาร (DCC) เพื่อยืนยัน หรือระบุเหตุผลความจำเป็นในการข้าม Rev.00 เริ่มต้น';
    }
  } else if (reqType === 'REVISION') {
    // 1. If document already exists in Master List
    if (systemDoc && systemCurrentRev) {
      const baseNum = sysCurrentNum;
      expectedProposedRev = baseNum === null ? '' : formatRevision(baseNum + 1);

      // Check if current revision in form does not match system's Master List
      if (formCurrentNum !== null && sysCurrentNum !== null && formCurrentNum !== sysCurrentNum) {
        isMismatchWithMaster = true;
      }

      // Check if proposed revision skips intermediate revisions
      if (baseNum !== null && formProposedNum !== null && formProposedNum > baseNum + 1) {
        isSkipped = true;
        const skipped = listSkipped(baseNum + 1, formProposedNum);
        warningMessage = `ในระบบทะเบียนเอกสารมี Rev.${systemCurrentRev} แต่ท่านขอขึ้นทะเบียนเป็น Rev.${proposedRev} (ตรวจพบการข้าม Rev.${skipped})`;
        dccPrompt = 'กรุณาติดต่อเจ้าหน้าที่ควบคุมเอกสาร (DCC) เพื่อยืนยันประวัติเอกสาร หรือระบุเหตุผลความจำเป็นในการข้าม Revision';
      }
    } else {
      // 2. Document not yet in master list, check relative current vs proposed
      if (formCurrentNum !== null && formProposedNum !== null) {
        expectedProposedRev = formatRevision(formCurrentNum + 1);
        if (formProposedNum > formCurrentNum + 1) {
          isSkipped = true;
          const skipped = listSkipped(formCurrentNum + 1, formProposedNum);
          warningMessage = `Rev. เดิมคือ ${currentRev} แต่เสนอเป็น Rev.${proposedRev} (ข้าม Rev.${skipped})`;
          dccPrompt = 'กรุณาระบุเหตุผลความจำเป็นในการข้าม Revision หรือติดต่อ DCC';
        }
      }
    }
  }

  return {
    isSkipped,
    isMismatchWithMaster,
    systemDoc,
    systemCurrentRev,
    expectedProposedRev,
    proposedNum: formProposedNum,
    currentNum: formCurrentNum,
    skippedRevs,
    warningMessage,
    dccPrompt,
  };
}
