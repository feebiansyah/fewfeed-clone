import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { handleMessage } from './worker.mjs';

const sender = { id: 'our-extension', frameId: 0, tab: { id: 12 }, url: 'http://localhost:3000/dev/one-card-spike', origin: 'http://localhost:3000' };
const ping = { type: 'FEWCLONE_PING', requestId: 'test-123' };

test('worker rejects foreign origins, frames, extension senders and arbitrary operations', async () => {
  for (const change of [{ url: 'https://evil.test' }, { origin: 'http://localhost:4000' }, { frameId: 1 }, { id: 'other' }, { url: 'http://localhost:3000/other' }]) {
    assert.equal(await handleMessage(ping, { ...sender, ...change }, 'our-extension'), null);
  }
  const detected = await handleMessage(ping, sender, 'our-extension');
  assert.equal(detected.status, 'DETECTED');
  assert.equal(detected.auth, 'BLOCKED');
  assert.equal(await handleMessage({ ...ping, url: 'https://evil.test' }, sender, 'our-extension'), null);
  assert.equal(await handleMessage({ ...ping, type: 'FEWCLONE_PUBLISH' }, sender, 'our-extension'), null);
});

test('content script checks source/origin and projects safe response fields only', async () => {
  const listeners = {}, posted = [], sent = [];
  const window = { location: { origin: 'http://localhost:3000', pathname: '/dev/one-card-spike' },
    addEventListener: (name, fn) => listeners[name] = fn,
    postMessage: data => posted.push(data) };
  window.top = window;
  const chrome = { runtime: { id: 'our-extension', onMessage: { addListener() {} },
    sendMessage: async data => { sent.push(data); return { type: 'FEWCLONE_EVENT', requestId: data.requestId, status: 'DETECTED', auth: 'BLOCKED', access_token: 'synthetic-secret' }; } } };
  vm.runInNewContext(readFileSync(new URL('./content.js', import.meta.url), 'utf8'), { window, chrome, Set });
  await listeners.message({ source: {}, origin: window.location.origin, data: ping });
  await listeners.message({ source: window, origin: 'https://evil.test', data: ping });
  assert.equal(sent.length, 0);
  await listeners.message({ source: window, origin: window.location.origin, data: ping });
  assert.equal(sent.length, 1);
  assert.equal(posted[0].status, 'DETECTED');
  assert.ok(!JSON.stringify(posted).includes('synthetic-secret'));
});

test('real worker RUN reports auth blocker without fetch or credential output', async () => {
  const previous = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; throw new Error('unexpected network'); };
  try {
    const events = [];
    const result = await handleMessage({ type: 'FEWCLONE_RUN', requestId: 'run-1', input: {
      adAccountId: '123', pageId: '456', message: '', title: 'Test', description: '', caption: '', link: 'https://example.com',
      image: { mime: 'image/png', bytes: 'iVBORw0KGgo=' },
    } }, sender, 'our-extension', event => events.push(event));
    assert.equal(result.status, 'FAILED');
    assert.equal(result.code, 'AUTH_BLOCKED');
    assert.equal(fetched, false);
    assert.deepEqual(events.map(event => event.status), ['UPLOADING']);
    assert.ok(!Object.hasOwn(result, 'input'));
    assert.ok(!Object.hasOwn(result, 'access_token'));
  } finally { globalThis.fetch = previous; }
});

test('manifest limits hosts, contains no cookie/scripting/storage permission or external entry', () => {
  const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ['https://graph.facebook.com/*']);
  assert.equal(manifest.permissions, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ['http://localhost/dev/one-card-spike']);
  assert.equal(manifest.content_scripts[0].all_frames, false);
});
