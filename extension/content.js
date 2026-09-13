// Isolated content script: no page-world injection, session access, or fetch.
(() => {
  const origin = 'http://localhost:3000';
  if (window !== window.top || window.location.origin !== origin || window.location.pathname !== '/dev/one-card-spike') return;
  const pending = new Set();
  const statuses = ['DETECTED', 'UPLOADING', 'IMAGE_UPLOADED', 'CREATING', 'CREATIVE_CREATED', 'POLLING', 'SUCCESS', 'FAILED'];
  const codes = ['AUTH_BLOCKED', 'SESSION_UNAVAILABLE', 'INVALID_INPUT', 'REJECTED', 'ACCESS_DENIED', 'UPLOAD_FAILED', 'CREATIVE_FAILED', 'READ_FAILED', 'POLL_TIMEOUT', 'NETWORK_ERROR', 'BUSY'];
  function relay(data) {
    if (!data || data.type !== 'FEWCLONE_EVENT' || !pending.has(data.requestId) || !statuses.includes(data.status)) return;
    const safe = { type: 'FEWCLONE_EVENT', requestId: data.requestId, status: data.status };
    if (data.auth === 'BLOCKED') safe.auth = 'BLOCKED';
    if (codes.includes(data.code)) safe.code = data.code;
    // Never forward raw message text, arbitrary response objects, or headers.
    if (typeof data.creativeId === 'string' && /^\d{1,30}$/.test(data.creativeId)) safe.creativeId = data.creativeId;
    if (typeof data.effectiveObjectStoryId === 'string' && /^\d{1,30}_\d{1,30}$/.test(data.effectiveObjectStoryId)) safe.effectiveObjectStoryId = data.effectiveObjectStoryId;
    if (Number.isInteger(data.attempt) && data.attempt >= 1 && data.attempt <= 15) safe.attempt = data.attempt;
    window.postMessage(safe, origin);
  }
  chrome.runtime.onMessage.addListener((data, sender) => {
    if (sender.id === chrome.runtime.id) relay(data);
  });
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== origin || window.location.pathname !== '/dev/one-card-spike') return;
    const data = event.data;
    if (!data || !['FEWCLONE_PING', 'FEWCLONE_RUN'].includes(data.type) || typeof data.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(data.requestId)) return;
    if (pending.has(data.requestId) || pending.size >= 2) return;
    pending.add(data.requestId);
    try { relay(await chrome.runtime.sendMessage(data)); }
    catch { relay({ type: 'FEWCLONE_EVENT', requestId: data.requestId, status: 'FAILED', code: 'NETWORK_ERROR' }); }
    finally { pending.delete(data.requestId); }
  });
})();
