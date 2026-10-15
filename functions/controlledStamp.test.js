const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, PDFName, PDFNumber, PDFString, degrees, rgb, StandardFonts } = require('pdf-lib');
const { controlledStamp, CONTROLLED_STAMP_VERSION } = require('./controlledStamp');

const departments = ['QA/QC', 'Production 1', 'Production 2/3', 'HR', 'Purchasing', 'Warehouse SP', 'Warehouse FG/DL', 'Planning', 'New Model', 'Marketing', 'R&D', 'Maintenance', 'QMR', 'Customer Rep'];
const scenarios = [
  ...[0, 90, 180, 270, -90].map(rotation => ({ name: `rotation-${rotation}`, width: 595, height: 842, rotation })),
  { name: 'a4-landscape', width: 842, height: 595 },
  { name: 'a3', width: 842, height: 1191 },
  { name: 'a5', width: 420, height: 595 },
  { name: 'receipt', width: 170, height: 320 },
  { name: 'small-page', width: 100, height: 150 },
  ...[0, 90, 180, 270].map(rotation => ({ name: `crop-${rotation}`, width: 700, height: 900, crop: [40, 60, 595, 780], rotation })),
  { name: 'negative-origin', width: 595, height: 842, origin: [-100, -200] },
  { name: 'crop-beyond-media', width: 595, height: 842, crop: [-30, -40, 650, 900] },
  { name: 'user-unit-2', width: 300, height: 420, unit: 2 },
  { name: 'blank', width: 595, height: 842, blank: true },
];

async function fixtures() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const scenario of scenarios) {
    const page = pdf.addPage([scenario.width, scenario.height]);
    const [x, y] = scenario.origin || [0, 0];
    if (scenario.origin) page.setMediaBox(x, y, scenario.width, scenario.height);
    if (scenario.crop) page.setCropBox(...scenario.crop);
    page.setRotation(degrees(scenario.rotation || 0));
    if (scenario.unit) page.node.set(PDFName.of('UserUnit'), PDFNumber.of(scenario.unit));
    if (scenario.blank) continue;
    // Full-page artwork and edge labels expose clipping, scaling and overlap regressions.
    page.drawRectangle({ x: x - 80, y: y - 80, width: scenario.width + 160, height: scenario.height + 160, color: rgb(0.88, 0.94, 0.98) });
    for (let row = 0; row < scenario.height; row += 35) {
      page.drawLine({ start: { x, y: y + row }, end: { x: x + scenario.width, y: y + row }, thickness: 0.5, color: rgb(0.1, 0.3, 0.5) });
    }
    for (let column = 0; column < scenario.width; column += 50) {
      page.drawLine({ start: { x: x + column, y }, end: { x: x + column, y: y + scenario.height }, thickness: 0.5, color: rgb(0.2, 0.4, 0.1) });
    }
    page.drawText(`TEST PDF ${scenario.name}`, { x: x + 8, y: y + scenario.height - 22, font, size: 9 });
    page.drawText('ORIGINAL BOTTOM EDGE', { x: x + 3, y: y + 3, font, size: 7 });
  }
  return pdf;
}

test('mixed pages survive stamping, saving and reopening without scaling or lost pages', async () => {
  const source = await fixtures();
  const sourceBytes = await source.save();
  const pdf = await PDFDocument.load(sourceBytes);
  const before = pdf.getPages().map(page => ({ media: page.getMediaBox(), crop: page.getCropBox(), rotation: page.getRotation().angle }));
  await controlledStamp(pdf, 'Warehouse FG/DL');
  const bytes = await pdf.save();
  const reopened = await PDFDocument.load(bytes);
  assert.equal(reopened.getPageCount(), scenarios.length);
  reopened.getPages().forEach((page, index) => {
    assert.equal(page.getRotation().angle, before[index].rotation);
    assert.equal(page.node.lookup(PDFName.of('DCSControlledCopyVersion'), PDFString).decodeText(), CONTROLLED_STAMP_VERSION);
    const box = page.getCropBox();
    const old = before[index];
    const width = Math.min(old.crop.x + old.crop.width, old.media.x + old.media.width) - Math.max(old.crop.x, old.media.x);
    const height = Math.min(old.crop.y + old.crop.height, old.media.y + old.media.height) - Math.max(old.crop.y, old.media.y);
    if (old.rotation % 180 === 0) { assert.equal(box.width, width); assert.ok(box.height > height); }
    else { assert.equal(box.height, height); assert.ok(box.width > width); }
    assert.deepEqual(page.getMediaBox(), box);
    assert.deepEqual(page.getTrimBox(), box);
  });
  if (process.env.STAMP_RENDER_OUTPUT) {
    fs.mkdirSync(process.env.STAMP_RENDER_OUTPUT, { recursive: true });
    fs.writeFileSync(path.join(process.env.STAMP_RENDER_OUTPUT, 'source.pdf'), sourceBytes);
    fs.writeFileSync(path.join(process.env.STAMP_RENDER_OUTPUT, 'controlled.pdf'), bytes);
  }
});

test('same department is idempotent; different department cannot stamp over an existing copy', async () => {
  let pdf = await PDFDocument.create();
  pdf.addPage();
  await controlledStamp(pdf, 'QA/QC');
  pdf = await PDFDocument.load(await pdf.save());
  const before = pdf.getPage(0).getMediaBox();
  const streamCount = pdf.getPage(0).node.Contents().size();
  await controlledStamp(pdf, 'QA/QC');
  assert.deepEqual(pdf.getPage(0).getMediaBox(), before);
  assert.equal(pdf.getPage(0).node.Contents().size(), streamCount);
  await assert.rejects(controlledStamp(pdf, 'HR'), /ต้นฉบับ/);
  assert.deepEqual(pdf.getPage(0).getMediaBox(), before);
});

test('all registered department labels and a long label remain encodable', async () => {
  for (const department of [...departments, 'Department '.repeat(10).trim()]) {
    const pdf = await PDFDocument.create();
    pdf.addPage([170, 320]);
    await controlledStamp(pdf, department);
    const result = await PDFDocument.load(await pdf.save());
    assert.equal(result.getPage(0).node.lookup(PDFName.of('DCSControlledCopyDepartment'), PDFString).decodeText(), department);
  }
});

test('form fields and link annotations retain their coordinates and values', async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([595, 842]);
  const field = source.getForm().createTextField('document-reference');
  field.setText('WI-PD2-004');
  field.addToPage(page, { x: 20, y: 750, width: 180, height: 25 });
  const link = source.context.register(source.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [20, 700, 200, 725], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/') } }));
  page.node.addAnnot(link);
  const pdf = await PDFDocument.load(await source.save());
  const before = pdf.getPage(0).node.Annots().asArray().map(ref => pdf.context.lookup(ref).lookup(PDFName.of('Rect')).toString());
  await controlledStamp(pdf, 'Production 2/3');
  const reopened = await PDFDocument.load(await pdf.save());
  assert.equal(reopened.getForm().getTextField('document-reference').getText(), 'WI-PD2-004');
  assert.deepEqual(reopened.getPage(0).node.Annots().asArray().map(ref => reopened.context.lookup(ref).lookup(PDFName.of('Rect')).toString()), before);
});

test('invalid pages fail before changing earlier valid pages', async () => {
  const pdf = await PDFDocument.create();
  const first = pdf.addPage();
  const second = pdf.addPage();
  second.setCropBox(1000, 1000, 20, 20);
  const before = first.getMediaBox();
  await assert.rejects(controlledStamp(pdf, 'HR'), /ขนาด/);
  assert.deepEqual(first.getMediaBox(), before);
  await assert.rejects(controlledStamp(pdf, ''), /แผนก/);
});

test('new unsaved drawing streams receive the footer outside the original clip', async () => {
  const pdf = await fixtures();
  await controlledStamp(pdf, 'Production 2/3');
  const reopened = await PDFDocument.load(await pdf.save());
  assert.equal(reopened.getPageCount(), scenarios.length);
  if (process.env.STAMP_RENDER_OUTPUT) fs.writeFileSync(path.join(process.env.STAMP_RENDER_OUTPUT, 'unsaved-controlled.pdf'), await pdf.save());
});
