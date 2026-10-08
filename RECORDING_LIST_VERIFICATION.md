# Recording list fix and live verification

This patch was prepared from local `main` at `1783b75`. That checkout still used Supabase recording storage; it did **not** contain the reported VM local-storage migration or failed-record recovery. Neither reported UUID existed in the database configured in this checkout. SSH to the VM failed authentication. Consequently the live cause, owner association, callback delivery, and playback have not been verified.

Apply only this focused list/UI patch to the current VM code. Do not replace its worker, media route, maintenance route, or sync implementation with the older local versions. No recording file or database record was modified.

## Flow traced in this checkout

- Start reserves a `Recording` document before dispatching Jibri capture through the worker. Worker finalization saves a ready snapshot and retries `/api/recording/callback` until acknowledged. The callback uses `syncRecording` to persist status, output metadata, and retention. Status polling and maintenance also reconcile worker state. Unknown recording IDs return callback 404; callbacks do not create ownerless records.
- `/lms/student/recordings` renders `StudentLmsDashboard(view="recordings")`. `LmsShell` mounts `MeetingRecordings`, which polls `/api/recording` every ten seconds using `cache: no-store`. It uses React state, not React Query/SWR. The status is `ready`, not `completed`.
- The separate course-attachment card uses `/api/lms/dashboard/student`, which reads `CourseSession.recordings`. Server recordings are stored in `Recording`; they do not automatically become course attachments. Its heading now makes that distinction explicit.
- List authentication uses the session email, lowercased. Hosts see their own records; participants see only explicitly shared, ready, unexpired records. No admin/role override. Both the list and media API require the associated meeting to have `endedAt`.
- Confirmed defect: the old list limited to 50 records before removing unended/missing meetings. Fifty recent unended rooms could therefore hide older completed recordings. The join/filter now occurs before the limit. The feed still intentionally returns the newest 50 eligible recordings; it has no pagination controls.
- The feed now reconciles active host recordings, allowing a missed callback to recover on an LMS poll. Worker failures preserve persisted results, return `syncPending`, and log only the recording ID. Ready records do not contact the worker. Focus also triggers a refresh, and a successful poll clears stale errors.
- Failed-to-ready recovery cannot be assessed in this checkout: its old sync implementation does not support that recovery. Keep the VM's existing implementation. The list does not resurrect failed or expired files.

## Read-only server checks

From the VM shell, after placing the diagnostic script in the current app checkout:

```bash
cd /opt/melanam
node scripts/inspect-recording-list.cjs 98f500b4-3ee3-419b-bca1-afa70f46eda9 827873ed-18f6-4217-bb72-f55d6f3af516
```

It loads `.env.local` (existing environment values take precedence), reports record existence, meeting association, ownership consistency, lifecycle/expiry, and file metadata. It does not print email addresses or credentials or modify anything. Optionally set `RECORDING_DIAGNOSTIC_HOST_EMAIL` locally to the signed-in host email to check exact ownership, then unset it. If records are absent, check that the application and diagnostic use the same MongoDB database. Do not copy credentials into chat.

Do not set `endedAt` merely because an MP4 exists: capture completion and meeting completion are distinct. If the meeting has not ended, use the authenticated host's End meeting for everyone action. If it actually ended but `endedAt` is missing, investigate `/api/meeting-end` and the deployed meeting UI before modifying data.

Inspect recent worker logs locally:

```bash
pm2 logs melanam-recording-worker --lines 100 --nostream
```

Review/redact logs before sharing them. Check the configured worker state directory for each UUID's JSON: `status`, `notifyPending`, `stoppedAt`, `durationSeconds`, and `sizeBytes`. Do not edit/reset state. A pending notification requires checking callback connectivity, matching worker secrets, and HTTP responses in app logs. A 404 can indicate that worker and app use different deployments/databases. Do not treat an existing MP4 as proof of successful MongoDB persistence.

## Authenticated browser verification

1. Sign in as the actual host on the live app and open `/lms/student/recordings`. In DevTools Network inspect `/api/recording`: it must return HTTP 200 and the expected UUIDs under `recordings`, with `status: "ready"`, `isHost: true`, and a future `expiresAt`. An absent record requires the diagnostics above; a 401 indicates the session is missing. Do not share session cookies.
2. Watch each recording, seek within it, and download it. Inspect the media request for successful 200/206 responses and `video/mp4`. Verify the deployed local stream route supports byte ranges. These checks must be performed on the VM build, not the older storage implementation here.
3. In a separate browser profile, sign in as an unrelated user. Neither UUID should appear; direct media access must fail. A meeting member must also be denied until the host shares. After sharing, verify the member sees the record and can watch/download, but cannot share/delete it.
4. Record and end a new meeting as host. Keep the LMS open through processing. The next successful poll after completion should show Watch/Download without database edits or worker resets. Verify both the MongoDB ready state and actual playback.
5. Verify expired recordings cannot be played and are absent from participant lists. Host history may still display an expired record without playback controls.

Verification completed locally: all 28 tests passed (`npm run test:meeting`); the five new list/UI tests were rerun successfully after correcting test cleanup. `npm run build` passed using `NEXT_BUILD_DIR=.next-recording-check` to isolate it from development output. The real list aggregation also executed successfully against the configured MongoDB in a read-only check with a synthetic, nonmatching user email; this checks query compatibility, not live host visibility. `git diff --check` passed. These checks do not validate the VM's unprovided local-storage code or live MP4 delivery.
