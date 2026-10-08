export const RECORDING_SETUP_MESSAGE = 'Server recording is not set up yet. Ask the workspace administrator to connect the recording server.';

// Shared by status and start: host permission alone does not mean capture is available.
export function getRecordingAvailability(env: NodeJS.ProcessEnv = process.env) {
  const required = ['JITSI_JWT_SECRET', 'RECORDING_WORKER_URL', 'RECORDING_WORKER_SECRET'] as const;
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) return { available: false, code: 'RECORDING_NOT_CONFIGURED', message: RECORDING_SETUP_MESSAGE };
  try {
    const url = new URL(env.RECORDING_WORKER_URL!);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid URL');
  } catch {
    return { available: false, code: 'RECORDING_NOT_CONFIGURED', message: RECORDING_SETUP_MESSAGE };
  }
  return { available: true, code: null, message: null };
}
