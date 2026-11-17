import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

test('notification click preserves an open DAR and otherwise follows the app link', async () => {
  const output = await build({ entryPoints: ['src/services/pwaService.ts'], bundle: true, platform: 'node', format: 'cjs', write: false, plugins: [{ name: 'firebase-boundary', setup(b) {
    b.onResolve({ filter: /^(firebase\/messaging|firebase\/functions|\.\.\/lib\/firebase)$/ }, args => ({ path: args.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: args.path === 'firebase/messaging'
      ? 'export const getMessaging=()=>({});export const getToken=async()=>"token";export const isSupported=async()=>true;export const onMessage=()=>()=>{};'
      : args.path === 'firebase/functions' ? 'export const httpsCallable=()=>async()=>({});' : 'export const firebaseApp={};export const firebaseFunctions={};' }));
  } }] });
  const handlers: Record<string, (event: any) => void> = {};
  const navigated: string[] = [], shown: string[] = [];
  let draftOpen = true;
  const serviceWorker = { addEventListener: (name: string, fn: (event: any) => void) => { handlers[name] = fn; }, register: async () => ({}) };
  const document = { baseURI: 'https://example.test/Document-Control-System01/', getElementById: () => draftOpen ? {} : null };
  const window = { location: { origin: 'https://example.test', assign: (url: string) => navigated.push(url) }, addEventListener: () => {}, dispatchEvent: (event: Event) => { shown.push(event.type); } };
  const context: any = { module: { exports: {} }, require: createRequire(import.meta.url), navigator: { serviceWorker }, document, window, URL, Event, console };
  vm.runInNewContext(output.outputFiles[0].text, context);
  context.module.exports.initializePwa();
  const send = (url: string) => handlers.message({ data: { type: 'DCS_OPEN_NOTIFICATION', url } });
  const distribution = 'https://example.test/Document-Control-System01/?view=distribution';
  send(distribution);
  assert.deepEqual(navigated, []);
  assert.deepEqual(shown, ['dcs:dar-notification']);
  draftOpen = false;
  send(distribution);
  assert.deepEqual(navigated, [distribution]);
  send('https://elsewhere.test/Document-Control-System01/?view=distribution');
  send('https://example.test/unrelated/?view=distribution');
  assert.deepEqual(navigated, [distribution]);
});

test('service worker focuses the existing app without navigating over unsent work', async () => {
  const source = fs.readFileSync('public/firebase-messaging-sw.js', 'utf8');
  const handlers: Record<string, (event: any) => void> = {};
  const calls: Array<[string, unknown?]> = [];
  const existing = {
    url: 'https://example.test/Document-Control-System01/',
    postMessage: (message: unknown) => calls.push(['message', message]),
    focus: async () => { calls.push(['focus']); },
    navigate: async (url: string) => { calls.push(['navigate', url]); },
  };
  let clients: typeof existing[] = [existing];
  const self = { registration: { scope: existing.url }, location: { origin: 'https://example.test' },
    addEventListener: (name: string, fn: (event: any) => void) => { handlers[name] = fn; },
    clients: { matchAll: async () => clients, openWindow: async (url: string) => { calls.push(['open', url]); } } };
  vm.runInNewContext(source, { self, URL, importScripts: () => {}, firebase: { initializeApp: () => {}, messaging: () => ({ onBackgroundMessage: () => {} }) } });
  const target = 'https://example.test/Document-Control-System01/?view=distribution';
  const click = async () => {
    let task: Promise<unknown> | undefined;
    handlers.notificationclick({ notification: { data: { url: target }, close: () => {} }, waitUntil: (promise: Promise<unknown>) => { task = promise; } });
    await task;
  };
  await click();
  assert.deepEqual(calls.map(call => call[0]), ['message', 'focus']);
  assert.equal((calls[0][1] as any).type, 'DCS_OPEN_NOTIFICATION');
  assert.equal((calls[0][1] as any).url, target);
  calls.length = 0; clients = [{ ...existing, url: 'https://example.test/another-app/' }];
  await click();
  assert.deepEqual(calls.map(call => call[0]), ['open']);
  calls.length = 0; clients = [];
  await click();
  assert.deepEqual(calls.map(call => call[0]), ['open']);
});
