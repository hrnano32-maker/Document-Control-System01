import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';

// Use the production profile loader, snapshot reader and React screen. Only
// Firebase I/O and the current component context are replaced.
test('Audit Trail opens for DCC with legacy profiles and real maintenance record shapes', async () => {
  const profile = { role: 'DCC_ADMIN', department: 'QA/QC', active: true, allowedViews: ['dashboard'] };
  const docs = [
    { id: 'qa-event', data: () => ({ timestamp: '2026-11-24T01:00:00Z', actorDept: 'DCC', actorUid: 'dcc-id', actionType: 'DEPARTMENT_NORMALIZED', description: 'ปรับสิทธิ์ QA/QC ในรายการแจกจ่ายเดิม', details: { distributionId: 'DC-1', oldDepartments: ['QA'] } }) },
    { id: 'return-event', data: () => ({ timestamp: {seconds: 1795482000, nanoseconds: 0}, actorDept: 'Purchasing', actor: 'Purchasing', actionType: 'SIGNATURE_CAPTURED', docNo: 'WI-01', revision: '00', description: 'ยืนยันคืนฉบับเดิม' }) },
  ];
  let constraints: any[], listenerError: any;
  const scope = {
    ctx: {} as any,
    io: {
      doc: () => ({}), getDoc: async () => ({ exists: () => true, data: () => profile }),
      where: (...args: any[]) => args, orderBy: (...args: any[]) => args,
      collection: () => ({}), query: (_: unknown, ...items: any[]) => { constraints = items; },
      onSnapshot: (_: unknown, next: (v: any) => void, fail: any) => { listenerError = fail; next({ docs }); return () => {}; },
    },
    module: {exports: {} as any}, require: createRequire(import.meta.url), console,
  };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { AuditTrailView } from './src/components/AuditTrailView';
    export { subscribeAuditForUser } from './src/services/dcsRepository';
    export { loadDcsProfile } from './src/services/authService';
    export const render = () => renderToStaticMarkup(<AuditTrailView />);
    `, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, platform: 'node', packages: 'external', write: false, format: 'cjs',
    plugins: [{ name: 'audit-fixtures', setup(b) {
      b.onResolve({ filter: /context\/DcsContext$|lib\/firebase$|^firebase\/firestore$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('DcsContext') ? 'export const useDcs = () => globalThis.ctx' : 'module.exports = globalThis.io' }));
    } }],
  });
  vm.runInNewContext(bundle.outputFiles[0].text, scope);
  const { render, loadDcsProfile, subscribeAuditForUser } = scope.module.exports;
  const user = await loadDcsProfile({ uid: 'dcc-id' });
  assert.ok(user.allowedViews.includes('audit'));
  Object.assign(scope.ctx, {currentUser: user, auditStatus: 'ready'});
  const fail = () => {};
  subscribeAuditForUser(user, (rows: any[]) => { scope.ctx.auditLogs = rows; }, fail);
  assert.equal(listenerError, fail);
  assert.deepEqual(constraints!, [['timestamp', 'desc']]);
  const html = render();
  assert.match(html, /ปรับสิทธิ์ QA\/QC ในรายการแจกจ่ายเดิม/);
  assert.match(html, /UID: dcc-id/);
  assert.match(html, /WI-01/);
  assert.match(html, /2 เหตุการณ์/);
  assert.doesNotMatch(html, /Invalid Date/);
  assert.equal(scope.ctx.auditLogs[1].id, 'return-event');

  Object.assign(profile, {role: 'DEPT_CONTROLLER', department: 'DCC'});
  scope.ctx.currentUser = await loadDcsProfile({ uid: 'staff-id' });
  assert.ok(!scope.ctx.currentUser.allowedViews.includes('audit'));
  subscribeAuditForUser(scope.ctx.currentUser, (rows: any[]) => { scope.ctx.auditLogs = rows; }, fail);
  assert.deepEqual(constraints!, [['actorDept', '==', 'DCC'], ['timestamp', 'desc']]);
  assert.doesNotMatch(render(), /WI-01|DCC Admin/);

  scope.ctx.auditStatus = 'denied';
  assert.match(render(), /ไม่มีสิทธิ์อ่านประวัติจากฐานข้อมูล/);
  assert.doesNotMatch(render(), /ไม่พบบันทึกเหตุการณ์ตามเงื่อนไข|WI-01/);
  scope.ctx.auditStatus = 'error';
  assert.match(render(), /ลองโหลดประวัติอีกครั้ง/);
});
