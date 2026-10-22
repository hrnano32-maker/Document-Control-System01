import type { DarAttachment, DarRecord } from '../types';

export const MAX_DAR_PDFS = 20;
export const MAX_DAR_PDF_BYTES = 25 * 1024 * 1024;
export const formatPdfSize = (bytes: number) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

export const validateDarPdf = async (file: Blob, name: string, type = file.type) => {
  if (!name.toLowerCase().endsWith('.pdf') || (type && type !== 'application/pdf')) {
    throw new Error(`${name}: แนบได้เฉพาะไฟล์ PDF เท่านั้น`);
  }
  if (!file.size || file.size >= MAX_DAR_PDF_BYTES) throw new Error(`${name}: ไฟล์ PDF ต้องมีขนาดน้อยกว่า 25 MB`);
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...header) !== '%PDF-') throw new Error(`${name}: เนื้อหาไฟล์ไม่ใช่ PDF กรุณาแปลงเป็น PDF ก่อนแนบ`);
};

// Old single-file DARs remain readable; the array is authoritative for new DARs.
export const getDarAttachments = (dar: Pick<DarRecord, 'attachments' | 'attachmentStoragePath' | 'attachmentFileName' | 'attachmentFileSize' | 'attachmentFileType'>): DarAttachment[] =>
  Array.isArray(dar.attachments) && dar.attachments.length ? dar.attachments
    : dar.attachmentStoragePath ? [{ name: dar.attachmentFileName || 'document.pdf', size: dar.attachmentFileSize || '', type: dar.attachmentFileType || 'application/pdf', storagePath: dar.attachmentStoragePath }] : [];

export const saveDownloadedBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.style.display = 'none';
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
};
