// Explicit deployment preparation. Never makes an existing public bucket private silently.
require('dotenv').config({ path: '.env.local', quiet: true });
const { MongoClient } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');
async function main() {
  for (const key of ['MONGODB_URI', 'SUPABASE_SERVICE_ROLE_KEY']) if (!process.env[key]) throw Error(`${key} is required`);
  const storage = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY).storage;
  const { data: buckets, error } = await storage.listBuckets();
  if (error) throw error;
  const existing = buckets.find(bucket => bucket.id === 'meeting-recordings');
  if (existing?.public) throw Error('meeting-recordings must be private. Fix bucket visibility before enabling recording.');
  if (!existing) {
    const { error } = await storage.createBucket('meeting-recordings', { public: false, allowedMimeTypes: ['video/mp4'], fileSizeLimit: 40 * 1024 ** 3 });
    if (error) throw error;
  }
  const mongo = new MongoClient(process.env.MONGODB_URI);
  try {
    await mongo.connect();
    await mongo.db().collection('recordings').createIndexes([
      { key: { recordingId: 1 }, unique: true },
      { key: { activeScope: 1 }, unique: true, partialFilterExpression: { activeScope: { $type: 'string' } } },
      { key: { activeMeeting: 1 }, unique: true, partialFilterExpression: { activeMeeting: { $type: 'string' } } },
      { key: { scopeKey: 1, month: 1 } }, { key: { hostEmail: 1 } }, { key: { sharedWith: 1 } },
    ]);
    await mongo.db().collection('meetingmembers').createIndex({ meetingId: 1, userEmail: 1 }, { unique: true });
    console.log('Private recording bucket and quota indexes prepared. Check the project-wide upload limit is at least 40 GiB.');
  } finally { await mongo.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
