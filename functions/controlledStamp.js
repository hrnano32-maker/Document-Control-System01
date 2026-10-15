const {
  StandardFonts, PDFName, PDFNumber, PDFString,
  pushGraphicsState, popGraphicsState, rectangle, clip, endPath,
  beginText, endText, setFontAndSize, setTextMatrix, showText,
  setFillingRgbColor, setStrokingRgbColor, setLineWidth, moveTo, lineTo, stroke,
} = require('pdf-lib');

const CONTROLLED_STAMP_VERSION = 'text-footer-v1';
const VERSION_KEY = PDFName.of('DCSControlledCopyVersion');
const DEPARTMENT_KEY = PDFName.of('DCSControlledCopyDepartment');

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (font.widthOfTextAtSize(line + character, size) > maxWidth) {
        if (!line) throw new Error('พื้นที่หน้ากระดาษเล็กเกินไปสำหรับข้อความ Controlled Copy');
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Add space OUTSIDE the original visible page; never guess where its content is.
// Original content, annotations and coordinates stay at 1:1 scale. The controlled
// derivative has a taller visible page; the separately archived original is untouched.
async function controlledStamp(pdf, department) {
  const label = String(department || '').trim();
  if (!label) throw new Error('ไม่พบแผนกผู้รับสำหรับ Controlled Copy');
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  font.encodeText(label); // Fail rather than silently dropping an unsupported department name.

  // Preflight all pages before changing any page, including accidental re-stamping.
  const layouts = pdf.getPages().map(page => {
    const version = page.node.lookupMaybe(VERSION_KEY, PDFString)?.decodeText();
    const stampedDepartment = page.node.lookupMaybe(DEPARTMENT_KEY, PDFString)?.decodeText();
    if (version) {
      if (version === CONTROLLED_STAMP_VERSION && stampedDepartment === label) return null;
      throw new Error('กรุณาใช้ PDF ต้นฉบับที่ยังไม่ได้ประทับตราสำหรับสร้าง Controlled Copy');
    }
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    const x = Math.max(media.x, crop.x);
    const y = Math.max(media.y, crop.y);
    const width = Math.min(media.x + media.width, crop.x + crop.width) - x;
    const height = Math.min(media.y + media.height, crop.y + crop.height) - y;
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const unit = page.node.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber() ?? 1;
    if (![x, y, width, height, unit].every(Number.isFinite) || width <= 0 || height <= 0 || unit <= 0 || ![0, 90, 180, 270].includes(rotation)) {
      throw new Error('ขนาดหรือการหมุนหน้า PDF ไม่ถูกต้อง');
    }
    const visibleWidth = rotation % 180 === 0 ? width : height;
    const padding = 12 / unit;
    const usableWidth = visibleWidth - 2 * padding;
    if (usableWidth <= 0) throw new Error('พื้นที่หน้ากระดาษเล็กเกินไปสำหรับ Controlled Copy');
    const lines = [
      ...wrapText('CONTROLLED COPY', font, 12 / unit, usableWidth).map(text => ({ text, size: 12 / unit })),
      ...wrapText(`DEPARTMENT: ${label}`, font, 11 / unit, usableWidth).map(text => ({ text, size: 11 / unit })),
    ];
    const band = (16 + 14 * lines.length) / unit;
    const box = rotation === 0 ? { x, y: y - band, width, height: height + band }
      : rotation === 90 ? { x, y, width: width + band, height }
      : rotation === 180 ? { x, y, width, height: height + band }
      : { x: x - band, y, width: width + band, height };
    const point = (u, v) => rotation === 0 ? [x + u, y - band + v]
      : rotation === 90 ? [x + width + band - v, y + u]
      : rotation === 180 ? [x + width - u, y + height + band - v]
      : [x - band + v, y + height - u];
    return { page, x, y, width, height, rotation, unit, visibleWidth, padding, lines, band, box, point };
  });

  for (const layout of layouts) {
    if (!layout) continue;
    const { page, x, y, width, height, rotation, unit, visibleWidth, padding, lines, band, box, point } = layout;
    // Preserve the old CropBox clipping: cropped artwork must not reappear inside
    // the new footer. Isolate original graphics state from the new text stream.
    page.node.normalize();
    const start = pdf.context.register(pdf.context.contentStream([
      pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath(),
    ]));
    const end = pdf.context.register(pdf.context.contentStream([popGraphicsState()]));
    page.node.wrapContentStreams(start, end);
    for (const setter of ['setMediaBox', 'setCropBox', 'setBleedBox', 'setTrimBox', 'setArtBox']) {
      page[setter](box.x, box.y, box.width, box.height);
    }

    const fontKey = page.node.newFontDictionary('ControlledCopy', font.ref);
    const [a, b, c, d] = {
      0: [1, 0, 0, 1], 90: [0, 1, -1, 0],
      180: [-1, 0, 0, -1], 270: [0, -1, 1, 0],
    }[rotation];
    const operators = [
      pushGraphicsState(), setLineWidth(0.5 / unit), setStrokingRgbColor(0.82, 0, 0),
      moveTo(...point(padding, band - 1 / unit)),
      lineTo(...point(visibleWidth - padding, band - 1 / unit)), stroke(),
      setFillingRgbColor(0.72, 0, 0),
    ];
    lines.forEach(({ text, size }, index) => {
      const textWidth = font.widthOfTextAtSize(text, size);
      const [tx, ty] = point((visibleWidth - textWidth) / 2, band - (18 + 14 * index) / unit);
      operators.push(beginText(), setFontAndSize(fontKey, size), setTextMatrix(a, b, c, d, tx, ty), showText(font.encodeText(text)), endText());
    });
    operators.push(popGraphicsState());
    // Own stream, not page.drawText(): a cached original stream may be inside the clip.
    page.node.addContentStream(pdf.context.register(pdf.context.contentStream(operators)));
    page.node.set(VERSION_KEY, PDFString.of(CONTROLLED_STAMP_VERSION));
    page.node.set(DEPARTMENT_KEY, PDFString.of(label));
  }
}

module.exports = { controlledStamp, CONTROLLED_STAMP_VERSION };
