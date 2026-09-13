import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, runSpike, safeError, validateInput, createTransport } from './core.mjs';
import { getAuthorization } from './auth.mjs';

const input = {
  adAccountId: '123', pageId: '456', message: 'Primary', link: 'https://example.com/item',
  caption: 'example.com', title: 'Title', description: 'Description',
  image: { bytes: 'iVBORw0KGgo=', mime: 'image/png' },
};
const picture = 'https://example.fbcdn.net/image.png';

test('validates full-size images without regex stack overflow and rejects oversized input', () => {
  const image = Buffer.alloc(5 * 1024 * 1024);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(image);
  assert.doesNotThrow(() => validateInput({ ...input, image: { mime: 'image/png', bytes: image.toString('base64') } }));
  assert.throws(() => validateInput({ ...input, image: { mime: 'image/png', bytes: Buffer.concat([image, Buffer.from([0])]).toString('base64') } }));
});

test('only three operations; arbitrary URLs, extra fields and path injection rejected', () => {
  for (const op of ['PUBLISH', 'ads', 'adsets', 'campaigns', 'graphql', 'feed', 'schedule', 'https://evil.test']) {
    assert.throws(() => buildRequest(op, {}));
  }
  assert.throws(() => validateInput({ ...input, url: 'https://evil.test' }));
  assert.throws(() => validateInput({ ...input, access_token: 'synthetic-secret' }));
  assert.throws(() => validateInput({ ...input, adAccountId: '123/ads' }));
  assert.throws(() => buildRequest('GET_CREATIVE_STORY_ID', { creativeId: '789', url: 'https://evil.test' }));
  assert.throws(() => buildRequest('GET_CREATIVE_STORY_ID', { creativeId: '../ads' }));
});

test('upload bytes and creative picture/flags match researched image flow', () => {
  const upload = buildRequest('UPLOAD_AD_IMAGE', { adAccountId: '123', image: input.image });
  assert.equal(upload.url, 'https://graph.facebook.com/v21.0/act_123/adimages?fields=url');
  assert.equal(upload.init.method, 'POST');
  assert.equal(upload.init.body.get('bytes'), input.image.bytes);
  const creative = buildRequest('CREATE_ONE_CARD_CREATIVE', { form: input, picture });
  const spec = JSON.parse(creative.init.body).object_story_spec;
  assert.deepEqual(spec, { page_id: '456', link_data: {
    message: 'Primary', link: input.link, caption: 'example.com', name: 'Title', description: 'Description',
    picture, multi_share_end_card: true, multi_share_optimized: true,
  } });
  assert.equal(creative.init.method, 'POST');
  assert.match(creative.url, /\/act_123\/adcreatives\?fields=effective_object_story_id$/);
});

async function scenario(foundAt) {
  const calls = [], events = [];
  let reads = 0;
  const request = async (operation, payload) => {
    calls.push(operation);
    buildRequest(operation, payload);
    if (operation === 'UPLOAD_AD_IMAGE') return { images: { first: { url: picture } }, access_token: 'synthetic-secret' };
    if (operation === 'CREATE_ONE_CARD_CREATIVE') return { id: '789', access_token: 'synthetic-secret' };
    return ++reads === foundAt ? { effective_object_story_id: '456_999', cookie: 'synthetic-secret' } : {};
  };
  let result, error;
  try {
    result = await runSpike(input, { request, sleep: async ms => calls.push(ms), emit: event => events.push(event) });
  } catch (caught) { error = caught; }
  return { calls, events, result, error };
}

test('immediate first GET, 4 seconds between reads, hard stop on story ID', async () => {
  const { calls, events, result } = await scenario(3);
  assert.deepEqual(calls, ['UPLOAD_AD_IMAGE', 'CREATE_ONE_CARD_CREATIVE', 'GET_CREATIVE_STORY_ID', 4000, 'GET_CREATIVE_STORY_ID', 4000, 'GET_CREATIVE_STORY_ID']);
  assert.deepEqual(result, { creativeId: '789', effectiveObjectStoryId: '456_999', attempt: 3 });
  assert.ok(!JSON.stringify({ events, result }).includes('synthetic-secret'));
});

test('first-attempt success performs no sleeps or subsequent requests', async () => {
  const { calls, result } = await scenario(1);
  assert.equal(calls.length, 3);
  assert.equal(result.attempt, 1);
});

test('timeout performs exactly 15 reads and 14 four-second waits', async () => {
  const { calls, error } = await scenario(Infinity);
  assert.equal(calls.filter(x => x === 'GET_CREATIVE_STORY_ID').length, 15);
  assert.equal(calls.filter(x => x === 4000).length, 14);
  assert.equal(safeError(error).code, 'POLL_TIMEOUT');
});

test('auth blocker prevents every network request; no credential input required', async () => {
  let calls = 0;
  const request = createTransport({ getAuthorization, fetchImpl: async () => { calls++; } });
  await assert.rejects(() => request('UPLOAD_AD_IMAGE', { adAccountId: '123', image: input.image }), e => safeError(e).code === 'AUTH_BLOCKED');
  assert.equal(calls, 0);
});

test('raw errors and unexpected codes never reach website', () => {
  for (const error of [new Error('access_token=synthetic-secret'), { code: 'synthetic-secret', message: 'cookie=secret' }]) {
    assert.deepEqual(safeError(error), { code: 'NETWORK_ERROR', message: 'Network or extension error. No request was retried automatically.' });
  }
});

test('transport strips Meta error text and uses credential only in outbound header', async () => {
  const request = createTransport({ getAuthorization: async () => 'synthetic-secret', fetchImpl: async (url, init) => {
    assert.ok(!url.includes('synthetic-secret'));
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-secret');
    return { ok: false, json: async () => ({ error: { code: 190, message: 'synthetic-secret' } }) };
  } });
  await assert.rejects(() => request('GET_CREATIVE_STORY_ID', { creativeId: '789' }), e => {
    assert.equal(safeError(e).code, 'SESSION_UNAVAILABLE');
    assert.ok(!JSON.stringify(safeError(e)).includes('synthetic-secret'));
    return true;
  });
});

test('upload failure never falls back to publishing or creates a creative', async () => {
  const calls = [];
  await assert.rejects(() => runSpike(input, { request: async op => { calls.push(op); return {}; } }), e => safeError(e).code === 'UPLOAD_FAILED');
  assert.deepEqual(calls, ['UPLOAD_AD_IMAGE']);
});
