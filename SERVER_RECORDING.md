# Server recording deployment

The app now uses host-controlled server recording on every plan. No meeting video is captured, stored, or encoded in the participant's browser. The recording worker controls a dedicated Jibri instance, encodes H.264/AAC MP4, and uploads to a private Supabase bucket using resumable TUS chunks. This works independently of mobile screen-capture APIs.

The code is not a running recorder deployment. Configure the services below before enabling recording in production. The existing local environment did not include a recording worker or Jibri credentials.

## Plans

| Plan | Monthly / annual INR | Recording per UTC month | Per recording | Recording storage | Retention |
| --- | --- | --- | --- | --- | --- |
| Free | 0 / 0 | 5 hours | 3 hours | 5 GB | 7 days |
| Pro | 799 / 8,590 | 30 hours | 6 hours | 50 GB | 30 days |
| Business | 2,499 / 26,990 | 100 hours | 12 hours | 250 GB | 90 days |
| Enterprise | Quoted | 300 hours | 24 hours | 1 TB | 365 days |

The catalog is in `lib/billing-plans.ts`; checkout uses the same prices. Enterprise currently has these explicit provisioned allowances; negotiated changes require updating the provisioning policy, not an unlimited switch. Recording storage is separate from file storage. Recording minutes do not consume AI credits. A recording is charged to the UTC calendar month when it starts; deleting the file does not refund capture time. Annual plans receive monthly recording allowances. Business/Enterprise organization members share the organization's allowance. One recording may capture or process per workspace at a time. Storage and the meeting's remaining time can shorten a recording's maximum duration. Existing subscription payment amounts are not rewritten.

Free server recording is an advantage over the published free Zoom and Google Meet offerings; it is not a claim of superiority in every market category. Checked 7 October 2026: [Zoom](https://zoom.us/pricing/) lists 40-minute/100-person free meetings, local-only free recording, and 10 GB cloud storage for Pro; [Google Workspace](https://workspace.google.com/pricing) includes meeting recording starting with Business Standard; [Teams](https://www.microsoft.com/en-in/microsoft-teams/compare-microsoft-teams-business-options) has different per-user bundles. Melanam retains its existing 25/150/500 participant allowances and adds recording value. Region, tax and contractual billing terms differ.

The internal margin fields are estimates, not measured profitability. Added monthly recording reserves are INR 35/200/650 for Free/Pro/Business, on top of AI credits, support and gateway estimates. Before selling at scale, measure Jibri instance utilization, transcoding cost, storage, and playback/download egress; a recording shared with many members can dominate egress costs. Annual discounts are approximately 10%, rather than assuming two free months while adding server costs.

## Required setup

If tapping Record returns 503, run `npm run recording:check` in the app workspace. Missing `JITSI_JWT_SECRET`, `RECORDING_WORKER_URL`, or `RECORDING_WORKER_SECRET` means deployment is incomplete. The JWT secret must match the actual Jitsi server; adding a random app-only value does not configure Jitsi. The worker URL must point to a running worker. The recording status API now reports this before enabling Record, while direct start requests still enforce the configuration and host checks.

1. Use a self-hosted Jitsi deployment with JWT role enforcement. Configure `JITSI_JWT_SECRET` and issuer in the app and Jitsi. Room creators receive moderator tokens; other attendees do not. Disable automatic owner promotion in the Jitsi/Prosody deployment. Keep the recorder XMPP account in the recorder domain, exempt from normal attendee login as required by Jibri. Do not publish this recorder in the Jicofo brewery used for native recording: all recording starts must pass through the app's host and quota checks. Hiding native recording UI alone is not a server authorization boundary.
2. Install Jibri, Node 20.12+ and FFmpeg/ffprobe on a Linux capture host with Chrome, X display and PulseAudio configured for Jibri. Use a **dedicated Jibri instance** with its HTTP API bound to loopback. The HTTP stop endpoint is instance-wide, so this instance must not also serve the old livestream endpoints or another worker. The worker follows the official [Jibri HTTP request schema](https://github.com/jitsi/jibri/blob/master/src/main/kotlin/org/jitsi/jibri/api/http/HttpApi.kt).
3. Create writable persistent directories `/srv/melanam/recordings` and `/srv/melanam/recording-state` shared by Jibri and the worker. Copy `backend/recording-service/finalize.sh` to the capture server, make it executable, and configure Jibri:

   ```hocon
   jibri.recording.recordings-directory = "/srv/melanam/recordings"
   jibri.recording.finalize-script = "/opt/melanam/backend/recording-service/finalize.sh"
   jibri.api.http.external-api-host = "127.0.0.1"
   jibri.api.http.external-api-port = 2222
   ```

   Preserve the rest of your working Jibri configuration. Capture output is bounded to 720p H.264/AAC at upload time. Provision disk for raw media plus the encoded output; processing temporarily uses both.
4. Create a **private** `meeting-recordings` Supabase bucket and the unique MongoDB indexes by running `node scripts/prepare-recordings.cjs` from the app workspace with deployment credentials. This script writes schema indexes and creates the new bucket; it does not backfill existing local recordings. Do not grant anonymous or authenticated direct object-read policies for this bucket. Set the project-wide upload size limit to at least 40 GiB. This requires a suitable storage tier/configuration; the product's Free plan is not the same as Supabase's infrastructure Free tier. Large recordings use [resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), not the 5 GB standard-upload path.
5. Copy `backend/recording-service/.env.example` to `.env` on the recorder host. Set its server-only credentials and app callback URL. Run `npm start` in that directory under a service manager with automatic restart. Run **one process per dedicated Jibri and state directory**. Do not horizontally replicate this worker behind a round-robin proxy; capacity expansion needs an explicit scheduler that pins each recording to a worker.
6. Add `RECORDING_WORKER_URL` and matching `RECORDING_WORKER_SECRET` to the Next.js server environment. Expose the worker only over a private network or an authenticated TLS reverse proxy. The app and worker use a shared secret; Jibri's own HTTP port must never be public. Restart the app after configuration.

## Lifecycle and recovery

- The host starts the room and chooses Record. Signed-in admitted attendees are added to a durable meeting group using their server session identity, never a client-supplied email. Anonymous guests see a recording indicator, but must sign in and join to receive recordings in their LMS.
- Starting reserves the workspace with a unique index, calculates remaining recording minutes and storage, and sets a server deadline. All start/stop routes check the actual host, without an instructor/admin bypass.
- Closing a tab or leaving normally does not stop recording. The explicit **End meeting for everyone** action closes admission, stops capture, and sends Jitsi's moderator-only [`endConference` command](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-commands/#endconference). Enable End Conference support on your Jitsi deployment. Attendee heartbeats leave ended meetings within 30 seconds as a fallback. Configure Jitsi authentication as above to prevent direct unauthenticated re-entry outside the app.
- The worker persists jobs before capture; reusing an ID cannot start duplicate capture. Deadlines and pending stops survive restarts. Stop-before-start creates a cancellation tombstone. Jibri's finalize script writes a durable completion marker. The worker then trims to the reserved time, transcodes, and resumes chunk uploads after transient failures. Processing/upload is retried three times; failed raw media is kept locally for one day for operator recovery, then removed. Successful raw media is removed after upload.
- Completion callbacks are authenticated and monotonic. A worker sweep calls `/api/recording/maintenance` every minute to reconcile state, retry stops for ended meetings and delete expired output. An external scheduler may call the same endpoint with the worker bearer secret if independent retention cleanup is required during worker downtime. Playback access expires even when storage deletion is delayed by an outage.
- After meeting end, hosts see processing/ready/failed recordings at the top of the LMS. Sharing waits for all captures to finish and grants all ready recordings in that meeting to its saved member group. Non-members cannot browse or sign playback URLs. Viewing/downloading uses short-lived five-minute signed URLs; already issued URLs may remain usable until they expire. Recipients can retain files they download.
- Old local-recording metadata remains historical only; files previously downloaded to a device cannot be recovered from the server. `/api/recording/local` now returns 410.

## Verification

Run `npm run test:meeting`, `node --test backend/recording-service/*.test.cjs`, and `npx tsc --noEmit --incremental false`. Worker integration tests use real FFmpeg/ffprobe and simulated Jibri/storage endpoints, including deadline, output codecs, restart, duplicate-start, resumable upload and cancellation checks. They do not prove a deployed Jitsi capture path.

Before launch, record a meeting containing camera video, screen sharing, host audio and attendee audio. End it as host; verify private LMS playback, sharing, member download, and denial to an unrelated account. Repeat the controls/playback on iOS Safari, Android Chrome, and desktop Chrome/Edge/Firefox/Safari. Test a long resumable upload and restart the worker during capture and during upload. Current browsers with MP4 H.264/AAC support are the target; arbitrary legacy browsers are not guaranteed.
