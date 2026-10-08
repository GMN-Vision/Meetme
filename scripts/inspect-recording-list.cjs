// Read-only diagnostics: never changes MongoDB, worker state, or recording files.
require('dotenv').config({ path: '.env.local', quiet: true });
const { MongoClient } = require('mongodb');
const fs = require('node:fs');
const path = require('node:path');
const ids = process.argv.slice(2);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

async function main() {
  if (!process.env.MONGODB_URI || !ids.length || ids.some(id => !uuid.test(id))) {
    throw Error('Provide MONGODB_URI through the app environment and UUID recording IDs as arguments.');
  }
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db();
    for (const recordingId of ids) {
      const r = await db.collection('recordings').findOne({ recordingId });
      if (!r) { console.log(JSON.stringify({ recordingId, found: false })); continue; }
      const meeting = await db.collection('meetings').findOne({ meetingId: r.meetingId });
      const expectedHost = process.env.RECORDING_DIAGNOSTIC_HOST_EMAIL?.trim().toLowerCase();
      const file = path.join('/srv/melanam/recordings', recordingId, 'meeting-output.mp4');
      const info = fs.existsSync(file) ? fs.lstatSync(file) : null;
      console.log(JSON.stringify({
        recordingId, found: true, meetingId: r.meetingId, status: r.status,
        hostPresent: Boolean(r.hostEmail),
        hostNormalized: Boolean(r.hostEmail) && r.hostEmail === r.hostEmail.trim().toLowerCase(),
        hostMatchesExpected: expectedHost ? r.hostEmail === expectedHost : 'not checked',
        meetingFound: Boolean(meeting), hostMatchesMeeting: Boolean(meeting) && r.hostEmail === meeting.hostEmail,
        meetingEnded: Boolean(meeting?.endedAt), expiresAt: r.expiresAt || null,
        unexpired: Boolean(r.expiresAt) && new Date(r.expiresAt).getTime() > Date.now(),
        shared: Boolean(r.sharedAt), sharedMemberCount: r.sharedWith?.length || 0,
        localFileExists: Boolean(info?.isFile()) && !info?.isSymbolicLink(),
        localFileBytes: info?.isFile() ? info.size : null,
        storedSizeMatches: info?.isFile() ? info.size === r.sizeBytes : null,
      }, null, 2));
    }
  } finally { await client.close(); }
}
main().catch(error => {
  // Driver messages may contain connection details; report only a safe category.
  console.error('Recording inspection failed:', error.name);
  process.exitCode = 1;
});
