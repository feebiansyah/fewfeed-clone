// Closed request builder: callers never supply an endpoint, method, or headers.
export const OPERATIONS = Object.freeze(['UPLOAD_AD_IMAGE', 'CREATE_ONE_CARD_CREATIVE', 'GET_CREATIVE_STORY_ID']);
const ERRORS = Object.freeze({
  AUTH_BLOCKED: 'Authentication blocked: research has not established a supported local authorization method. No Meta request was sent.',
  SESSION_UNAVAILABLE: 'Facebook authorization is missing or expired. This spike does not extract browser sessions.',
  INVALID_INPUT: 'Check numeric account/Page IDs, HTTPS destination, and a PNG/JPEG image (maximum 5 MiB).',
  REJECTED: 'Operation or request input is outside the spike allowlist.',
  ACCESS_DENIED: 'Meta denied access. Check Ad Account access, Page access, and required permissions.',
  UPLOAD_FAILED: 'Image upload failed or returned no usable image URL.',
  CREATIVE_FAILED: 'Creative creation failed. Check Page access and creative fields.',
  READ_FAILED: 'Creative lookup failed. Check account access and permissions.',
  POLL_TIMEOUT: 'Story ID was not available after 15 attempts. The creative may still exist; this test stopped.',
  NETWORK_ERROR: 'Network or extension error. No request was retried automatically.',
  BUSY: 'A spike is already running. Wait for it to finish.',
});
export class SpikeError extends Error {
  constructor(code) { super(ERRORS[code] || ERRORS.NETWORK_ERROR); this.code = code; }
}
export function safeError(error) {
  const code = error instanceof SpikeError && Object.hasOwn(ERRORS, error.code) ? error.code : 'NETWORK_ERROR';
  return { code, message: ERRORS[code] };
}
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new SpikeError('REJECTED');
}
function id(value) {
  if (typeof value !== 'string' || !/^\d{1,30}$/.test(value)) throw new SpikeError('INVALID_INPUT');
  return value;
}
function https(value) {
  try {
    const url = new URL(value);
    if (typeof value !== 'string' || value.length > 4096 || url.protocol !== 'https:' || url.username || url.password) throw 0;
    return value;
  } catch { throw new SpikeError('INVALID_INPUT'); }
}
function imageInput(image) {
  keys(image, ['bytes', 'mime']);
  if (!['image/png', 'image/jpeg'].includes(image.mime) || typeof image.bytes !== 'string' || image.bytes.length > 6990508 || image.bytes.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(image.bytes)) throw new SpikeError('INVALID_INPUT');
  // atob validates padding without a repeated-group regexp stack proportional to file size.
  let decoded;
  try { decoded = atob(image.bytes); } catch { throw new SpikeError('INVALID_INPUT'); }
  if (decoded.length > 5 * 1024 * 1024 || !(image.mime === 'image/png' ? decoded.startsWith('\x89PNG\r\n\x1a\n') : decoded.startsWith('\xff\xd8\xff'))) throw new SpikeError('INVALID_INPUT');
}
export function validateInput(form) {
  keys(form, ['adAccountId', 'pageId', 'message', 'link', 'caption', 'title', 'description', 'image']);
  id(form.adAccountId); id(form.pageId); https(form.link); imageInput(form.image);
  for (const key of ['message', 'caption', 'title', 'description']) {
    if (typeof form[key] !== 'string' || form[key].length > 5000) throw new SpikeError('INVALID_INPUT');
  }
  return form;
}
export function buildRequest(operation, input) {
  if (!OPERATIONS.includes(operation)) throw new SpikeError('REJECTED');
  const root = 'https://graph.facebook.com/v21.0/';
  if (operation === 'GET_CREATIVE_STORY_ID') {
    keys(input, ['creativeId']);
    return { url: `${root}${id(input.creativeId)}?fields=effective_object_story_id`, init: { method: 'GET' } };
  }
  if (operation === 'UPLOAD_AD_IMAGE') {
    keys(input, ['adAccountId', 'image']); id(input.adAccountId); imageInput(input.image);
    const body = new FormData();
    const fields = { bytes: input.image.bytes, name: input.image.mime === 'image/png' ? 'image.png' : 'image.jpg',
      image_creation_source: 'ADVERTISER_MANUAL_UPLOAD', include_headers: 'false', locale: 'en_US',
      method: 'post', pretty: '0', show_in_giyimage_library: 'true', suppress_http_code: '1',
      fb_api_caller_class: 'RelayModern', __ad_account_id: input.adAccountId };
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    return { url: `${root}act_${input.adAccountId}/adimages?fields=url`, init: { method: 'POST', body } };
  }
  keys(input, ['form', 'picture']);
  const form = validateInput(input.form);
  const link_data = {
    message: form.message || form.title, link: form.link, name: form.title, description: form.description,
    picture: https(input.picture), multi_share_end_card: true, multi_share_optimized: true,
    ...(form.caption ? { caption: form.caption } : {}),
  };
  return { url: `${root}act_${form.adAccountId}/adcreatives?fields=effective_object_story_id`, init: {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object_story_spec: { page_id: form.pageId, link_data } }),
  } };
}

// Authentication is an extension-internal dependency. Never accepted from web messages.
export function createTransport({ getAuthorization, fetchImpl = fetch }) {
  return async (operation, input) => {
    const { url, init } = buildRequest(operation, input);
    const authorization = await getAuthorization();
    if (typeof authorization !== 'string' || !authorization) throw new SpikeError('AUTH_BLOCKED');
    try {
      const response = await fetchImpl(url, { ...init, credentials: 'omit', redirect: 'error',
        referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(25000),
        headers: { ...init.headers, Authorization: `Bearer ${authorization}` } });
      const data = await response.json();
      if (!response.ok || data?.error) {
        const code = data?.error?.code;
        if (code === 190) throw new SpikeError('SESSION_UNAVAILABLE');
        if ([10, 200, 294].includes(code) || response.status === 403) throw new SpikeError('ACCESS_DENIED');
        throw new SpikeError(operation === 'UPLOAD_AD_IMAGE' ? 'UPLOAD_FAILED' : operation === 'CREATE_ONE_CARD_CREATIVE' ? 'CREATIVE_FAILED' : 'READ_FAILED');
      }
      return data;
    } catch (error) { throw error instanceof SpikeError ? error : new SpikeError('NETWORK_ERROR'); }
  };
}

export async function runSpike(input, { request, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), emit = () => {} }) {
  validateInput(input);
  emit({ status: 'UPLOADING' });
  const upload = await request('UPLOAD_AD_IMAGE', { adAccountId: input.adAccountId, image: input.image });
  const images = upload?.images;
  const picture = images && images[Object.keys(images)[0]]?.url;
  try { https(picture); } catch { throw new SpikeError('UPLOAD_FAILED'); }
  emit({ status: 'IMAGE_UPLOADED' });
  emit({ status: 'CREATING' });
  const creative = await request('CREATE_ONE_CARD_CREATIVE', { form: input, picture });
  let creativeId;
  try { creativeId = id(creative?.id); } catch { throw new SpikeError('CREATIVE_FAILED'); }
  emit({ status: 'CREATIVE_CREATED', creativeId });
  for (let attempt = 1; attempt <= 15; attempt++) {
    emit({ status: 'POLLING', creativeId, attempt });
    const data = await request('GET_CREATIVE_STORY_ID', { creativeId });
    const storyId = data?.effective_object_story_id;
    if (typeof storyId === 'string' && /^\d{1,30}_\d{1,30}$/.test(storyId)) {
      // HARD STOP: return immediately. No follow-up operation exists.
      return { creativeId, effectiveObjectStoryId: storyId, attempt };
    }
    if (storyId != null && storyId !== '') throw new SpikeError('READ_FAILED');
    if (attempt < 15) await sleep(4000);
  }
  throw new SpikeError('POLL_TIMEOUT');
}
