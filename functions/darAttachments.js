const MAX_DAR_PDFS = 20;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

function getDarAttachments(dar) {
  if (Array.isArray(dar.attachments) && dar.attachments.length) return dar.attachments;
  return dar.attachmentStoragePath ? [{ name: dar.attachmentFileName || 'document.pdf', size: dar.attachmentFileSize || '', type: dar.attachmentFileType || 'application/pdf', storagePath: dar.attachmentStoragePath }] : [];
}

function isDarAttachmentPath(path, darId, legacy = false) {
  if (typeof path !== 'string') return false;
  const parts = path.split('/');
  return parts[0] === 'dcs' && parts[1] === 'dar-attachments' && Boolean(parts[2])
    && ((parts.length === 5 && parts[3] === darId && Boolean(parts[4])) || (legacy && parts.length === 4 && Boolean(parts[3])));
}

function validateDarPdfAttachments(dar, darId) {
  const files = getDarAttachments(dar);
  if (!files.length || files.length > MAX_DAR_PDFS) throw new Error(`DAR ต้องแนบ PDF 1–${MAX_DAR_PDFS} ไฟล์`);
  for (const file of files) {
    if (typeof file.name !== 'string' || !/\.pdf$/i.test(file.name) || file.type !== 'application/pdf'
      || !isDarAttachmentPath(file.storagePath, darId, !dar.attachments?.length)) {
      throw new Error('ไฟล์แนบต้องเป็น PDF ของใบ DAR นี้เท่านั้น');
    }
  }
  return files;
}

module.exports = { MAX_DAR_PDFS, MAX_PDF_BYTES, getDarAttachments, isDarAttachmentPath, validateDarPdfAttachments };
