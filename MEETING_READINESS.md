# Meeting readiness: 25 people, three hours, one hour of shared video

## Current result

Local production build and 10 regression tests passed. These include simulated
three-hour heartbeats for 25 clients and a mocked meeting iframe remaining mounted
through network and device errors. They are **not** a three-hour media load test,
a measurement of US connectivity, or proof that all production features work.

The latest HTTPS check on 2026-09-30 returned HTTP 200 for `melanam.com`.
`meet.melanam.com/external_api.js` still failed with `SEC_E_CERT_EXPIRED`.
Production deployment and meeting-subdomain certificate renewal are still needed.
Local production smoke checks returned HTTP 200 for `/`, `/pricing`, and a room
page, with the expected camera, microphone and display-capture policy.

## Changes prepared

- Temporary HTTP failures, gateway errors, rate limits and offline heartbeat
  failures no longer hang up working calls. Only explicit access-policy denials do.
- Browser network events no longer destroy/recreate the Jitsi iframe. Native Jitsi
  recovery retains control of the media connection and screen-capture track.
- The parent leaves only after `readyToClose`, rather than during a conference
  transition. Device error notifications no longer replace an ongoing call.
- Camera capture defaults to 720p with simulcast and adaptive video enabled.
  Desktop clients can receive up to 25 video sources; phones receive up to nine.
- Screen sharing allows up to 30 fps and requests system audio where the browser
  supports it. The app delegates display capture to the meeting iframe.
- Private-room JWTs cover the remaining session allowance plus five minutes,
  rather than expiring after one hour. The general default is four hours.
- Each tab has its own participant identity. Background presence has five minutes
  of tolerance, and a returning heartbeat renews existing presence before pruning.
- Client clock drift cannot independently hang up a call. The server enforces the
  plan deadline, with an advance notice in the room.
- Unlimited plan limits remain unlimited rather than falling back to old limits.

## Before clients join

1. Renew and verify trusted HTTPS on **both domains**. No certificate bypasses.
2. Deploy this working tree through the established production process. Run
   `npm ci`, `npm run test:meeting`, and `npm run build` in the deployment checkout,
   then restart the existing app service before anyone joins.
3. Confirm the host's plan and use a fresh room. Free allows **120 people total**
   and **180 minutes from the first entry**, including setup/prejoin time. A full
   three-hour agenda plus early setup needs a longer allowance. Free does not
   include captions, AI notes or recording; this change does not override plans.
4. Rehearse with US participants using the same networks and devices planned for
   the meeting. Confirm two-way microphone audio, cameras, join/leave, chat and
   participant controls. Test any required files, whiteboard, captions or recording
   separately; they depend on additional services and were not live-validated.
5. On the presenting computer, select the browser tab containing the video and
   enable its audio-sharing checkbox where supported. Have a remote attendee
   confirm both the video's sound and the speaker's microphone. Use headphones.
6. Check the Jitsi bridge and TURN service from the actual participant networks.
   HTTPS availability alone does not prove UDP media or fallback relay operation.
   Monitor bridge CPU, bandwidth and packet loss during the rehearsal. There was
   no production server access or 25-person media capacity measurement here.

## Validation commands

```text
npm run test:meeting
npm run build
curl --head https://melanam.com/
curl --head https://meet.melanam.com/external_api.js
```

The tests use controlled clocks, mock API responses, a mock database and a mocked
Jitsi API. Actual browsers, video/audio transmission, certificates, server load,
recordings, uploads and third-party services require production rehearsal.

Implementation references: [Jitsi iframe events](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-events/)
and [Jitsi configuration](https://github.com/jitsi/jitsi-meet/blob/master/config.js).
The configuration documents screen-sharing frame-rate tradeoffs; 30 fps is an
allowed ceiling, not a promise of delivered quality under all network conditions.
