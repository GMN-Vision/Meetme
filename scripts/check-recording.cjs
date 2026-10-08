// Read-only recording preflight. Never prints credentials or changes services.
require('dotenv').config({ path: '.env.local', quiet: true });
async function main() {
  const required = ['JITSI_JWT_SECRET', 'RECORDING_WORKER_URL', 'RECORDING_WORKER_SECRET'];
  const missing = required.filter(name => !process.env[name]?.trim());
  if (missing.length) {
    console.error(`Recording setup incomplete. Missing: ${missing.join(', ')}`);
    console.error('Use the JWT secret configured on your Jitsi server and the URL/secret of your deployed recording worker. See SERVER_RECORDING.md.');
    process.exitCode = 1;
    return;
  }
  let url;
  try {
    url = new URL(process.env.RECORDING_WORKER_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error();
  } catch { throw Error('RECORDING_WORKER_URL must be a valid HTTP(S) URL without embedded credentials.'); }
  const response = await fetch(`${url.href.replace(/\/$/, '')}/health`, {
    headers: { Authorization: `Bearer ${process.env.RECORDING_WORKER_SECRET}` }, signal: AbortSignal.timeout(10000),
  }).catch(() => { throw Error('Cannot reach recording worker. Check that it is running and reachable from this app.'); });
  if (response.status === 401) throw Error('Worker rejected authentication. The app and worker secrets must match.');
  if (!response.ok) throw Error(`Recording worker/Jibri health check failed (HTTP ${response.status}).`);
  const body = await response.json().catch(() => null);
  if (body?.ok !== true) throw Error('Configured endpoint is not a healthy Melanam recording worker.');
  console.log('Recording configuration is present and the worker/Jibri endpoint is reachable. Verify JWT configuration matches Jitsi and perform a live test recording.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
