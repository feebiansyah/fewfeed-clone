import { SpikeError } from './core.mjs';

// Deliberately blocked. Research does not establish an authorized session-only
// Graph credential acquisition flow. Do not add extraction or web token inputs.
export async function getAuthorization() {
  throw new SpikeError('AUTH_BLOCKED');
}
