import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';

test('printed DAR shows the old and proposed revision of each row, while legacy rows remain readable', async () => {
  const output = await build({ entryPoints: ['src/components/DarPrintModal.tsx'], bundle: true, platform: 'node', format: 'cjs', external: ['react', 'react/*'], write: false, plugins: [{ name: 'context-boundary', setup(b) {
    b.onResolve({ filter: /context\/DcsContext$/ }, () => ({ path: 'context', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'js', contents: `export const useDcs=()=>({currentUser:{userName:'DCC',userRole:'DCC_ADMIN',currentDept:'DCC'},updateDarSignatures:async()=>{}});` }));
  } }] });
  const context: any = { module: { exports: {} }, require: createRequire(import.meta.url), console, Date, setTimeout, clearTimeout };
  vm.runInNewContext(output.outputFiles[0].text, context);
  const Print = context.module.exports.DarPrintModal;
  const dar = { id:'DAR-TEST', requestType:'REVISION', status:'APPROVED', requestDept:'HR', requesterName:'HR', requestDate:'2026-01-01', targetEffectiveDate:'2026-02-01', previousEffectiveDate:'2025-01-01', docNo:'WI-HR-01', docNameTh:'เอกสารหลัก', docNameEn:'', docType:'WI', currentRevision:'01', proposedRevision:'02', reasonForChange:'ปรับปรุง', additionalDocuments:[{docNo:'WI-HR-02',docNameTh:'เอกสารสอง',currentRevision:'03',revision:'04',previousEffectiveDate:'2025-01-01',reason:'ปรับปรุง'},{docNo:'WI-HR-03',docNameTh:'เอกสารเก่า',revision:'06',reason:'เก่า'}] };
  const html = renderToStaticMarkup(React.createElement(Print, { dar, onClose: () => {} }));
  assert.match(html, /01 ➔ 02/);
  assert.match(html, /03 ➔ 04/);
  assert.match(html, />06<\/td>/);
  assert.doesNotMatch(html, /undefined ➔ 06/);
});
