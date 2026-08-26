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
  if (!rev || rev === 'N/A' || rev.toUpperCase() === 'OBSOLETE') return null;
  const cleaned = rev.replace(/[^0-9]/g, '');
  if (cleaned === '') return null;
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? null : parsed;
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
  if (num === null) return '00';
  return formatRevision(num + 1);
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

  if (reqType === 'NEW') {
    expectedProposedRev = '00';
    if (formProposedNum !== null && formProposedNum > 0) {
      isSkipped = true;
      for (let i = 0; i < formProposedNum; i++) {
        skippedRevs.push(formatRevision(i));
      }
      warningMessage = `จัดทำเอกสารใหม่ (NEW) ตามมาตรฐานควรเริ่มต้นที่ Rev.00 แต่ท่านระบุเป็น Rev.${proposedRev} (ข้าม ${skippedRevs.join(', ')})`;
      dccPrompt = 'กรุณาติดต่อเจ้าหน้าที่ควบคุมเอกสาร (DCC) เพื่อยืนยัน หรือระบุเหตุผลความจำเป็นในการข้าม Rev.00 เริ่มต้น';
    }
  } else if (reqType === 'REVISION') {
    // 1. If document already exists in Master List
    if (systemDoc && systemCurrentRev) {
      const baseNum = sysCurrentNum !== null ? sysCurrentNum : (formCurrentNum !== null ? formCurrentNum : 0);
      expectedProposedRev = formatRevision(baseNum + 1);

      // Check if current revision in form does not match system's Master List
      if (formCurrentNum !== null && sysCurrentNum !== null && formCurrentNum !== sysCurrentNum) {
        isMismatchWithMaster = true;
      }

      // Check if proposed revision skips intermediate revisions
      if (formProposedNum !== null && formProposedNum > baseNum + 1) {
        isSkipped = true;
        for (let i = baseNum + 1; i < formProposedNum; i++) {
          skippedRevs.push(formatRevision(i));
        }
        warningMessage = `ในระบบทะเบียนเอกสารมี Rev.${systemCurrentRev} แต่ท่านขอขึ้นทะเบียนเป็น Rev.${proposedRev} (ตรวจพบการข้าม Rev.${skippedRevs.join(', Rev.')})`;
        dccPrompt = 'กรุณาติดต่อเจ้าหน้าที่ควบคุมเอกสาร (DCC) เพื่อยืนยันประวัติเอกสาร หรือระบุเหตุผลความจำเป็นในการข้าม Revision';
      }
    } else {
      // 2. Document not yet in master list, check relative current vs proposed
      if (formCurrentNum !== null && formProposedNum !== null) {
        expectedProposedRev = formatRevision(formCurrentNum + 1);
        if (formProposedNum > formCurrentNum + 1) {
          isSkipped = true;
          for (let i = formCurrentNum + 1; i < formProposedNum; i++) {
            skippedRevs.push(formatRevision(i));
          }
          warningMessage = `Rev. เดิมคือ ${currentRev} แต่เสนอเป็น Rev.${proposedRev} (ข้าม Rev.${skippedRevs.join(', Rev.')})`;
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
