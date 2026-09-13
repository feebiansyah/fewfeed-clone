import { createTransport, runSpike, safeError, SpikeError } from './core.mjs';
import { getAuthorization } from './auth.mjs';

let busy = false;
export async function handleMessage(message, sender, extensionId, notify = () => {}) {
  if (sender.id !== extensionId || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id)) return null;
  try {
    const url = new URL(sender.url);
    if (url.origin !== 'http://localhost:3000' || url.pathname !== '/dev/one-card-spike' || sender.origin !== url.origin) return null;
  } catch { return null; }
  if (!message || typeof message !== 'object' || !/^[a-zA-Z0-9-]{1,64}$/.test(message.requestId) || typeof message.requestId !== 'string') return null;
  const allowedKeys = message.type === 'FEWCLONE_RUN' ? ['type', 'requestId', 'input'] : ['type', 'requestId'];
  if (Object.keys(message).some(key => !allowedKeys.includes(key))) return null;
  const envelope = { type: 'FEWCLONE_EVENT', requestId: message.requestId };
  if (message.type === 'FEWCLONE_PING') return { ...envelope, status: 'DETECTED', auth: 'BLOCKED' };
  if (message.type !== 'FEWCLONE_RUN') return null;
  if (busy) return { ...envelope, status: 'FAILED', ...safeError(new SpikeError('BUSY')) };
  busy = true;
  try {
    const result = await runSpike(message.input, {
      request: createTransport({ getAuthorization }),
      emit: event => notify({ ...envelope, ...event }),
    });
    return { ...envelope, status: 'SUCCESS', ...result };
  } catch (error) {
    return { ...envelope, status: 'FAILED', ...safeError(error) };
  } finally { busy = false; }
}
