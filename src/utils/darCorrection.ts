// Firestore maps may arrive in a different key order after a server refresh.
// Compare their values, while preserving the order of document rows.
const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
  return value;
};

export const sameDarCorrectionValue = (key: string, left: unknown, right: unknown) => {
  const comparable = (value: unknown) => key === 'additionalDocuments'
    ? stableValue((Array.isArray(value) ? value : []).map(row => ({
      ...row, docNameEn: row.docNameEn ?? '', previousEffectiveDate: row.previousEffectiveDate ?? '',
    })))
    : value ?? '';
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
};

export const DAR_CORRECTION_LABELS: Record<string, string> = {
  currentRevision: 'Rev. เดิม', proposedRevision: 'Rev. ที่เสนอ',
  docNo: 'รหัสเอกสาร', docNameTh: 'ชื่อเอกสารภาษาไทย', docNameEn: 'ชื่อเอกสารภาษาอังกฤษ',
  targetEffectiveDate: 'วันที่เอกสารใหม่มีผล', previousEffectiveDate: 'วันที่เอกสารเดิมมีผล',
  reasonForChange: 'เหตุผลการดำเนินการ', changeDetails: 'รายละเอียดการเปลี่ยนแปลง',
  additionalDocuments: 'รายการเอกสารเพิ่มเติม',
};
