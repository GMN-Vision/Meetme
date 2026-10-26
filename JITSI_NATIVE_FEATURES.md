# Native Jitsi meeting features

The room now uses the Jitsi stage for presentations and synchronized video.
The former Shared display panel is no longer mounted in the meeting. The
existing Excalidraw Whiteboard button and overlay are available in the meeting
navigation. File uploads/downloads and the existing server recording and AI
services remain available.

## Using the meeting

- Whiteboard in the top meeting navigation opens the existing Excalidraw board.
  It uses the app's existing collaboration and saving services and does not
  require enabling Jitsi's native whiteboard.
- Share screen: choose a screen, application, or browser tab. Present PDFs,
  slides, images, and audio files this way. Use Jitsi's layout control to keep
  participant thumbnails visible. Jitsi does not render uploaded office files
  or PDFs itself.
- More actions → Share video: paste a YouTube URL. The presenter controls shared
  playback. Embedding restrictions on the YouTube video still apply.
- Files → Present in meeting: available to every joined participant for shared
  audio, video, images, PDFs, and PowerPoint files, including another user's files.
  Audio/video use Jitsi's shared player. Playback, pause, and seeking use Jitsi's synchronization.
  Every participant must be able to reach the app URL; localhost is only suitable
  for attendees on the same machine. A deleted file will no longer play.
- Images and PDF/PowerPoint slides open a presentation viewer. Select Share in
  meeting there, then select the presentation tab/window in the browser picker.
  The browser requires this selection; the app cannot silently capture a tab.
  PowerPoint (PPT/PPTX/PPS/PPSX/ODP) is converted to PDF locally on the app server
  using LibreOffice, which must be installed on that server. Set LIBREOFFICE_PATH
  if it is outside the standard Windows installation or Linux PATH. Slide preview
  conversion supports files up to 100 MB; larger files remain uploadable/downloadable
  under the plan limits. Conversion preserves static slides; animations, embedded
  media, and transitions are not played in the PDF viewer. Fonts can affect layout.
- More actions also exposes Share audio, Select background, and noise suppression
  where supported by the browser. Screen audio requires selecting audio in the
  browser's capture picker.
- Participants: moderators can manage participants and breakout rooms when the
  Jitsi server advertises breakout support. Security contains lobby/password
  controls. Chat includes Jitsi's polls; raise hand includes reactions.
- Picture-in-picture: use Jitsi's native meeting control when available.
  Requires a compatible Jitsi version and browser.
  Automatic PiP is controlled by Jitsi and browser permission/eligibility rules.

## Required deployment changes

On inspection during implementation, `https://meet.melanam.com/config.js` had
`whiteboard.enabled: false`, and its external API and client bundle did not
contain the current browser PiP implementation. Changing the Next.js app alone
cannot install these server capabilities. Jitsi controls PiP availability;
the app does not show a separate compatibility banner or presentation toolbar.

1. Upgrade the **whole Jitsi deployment** to a release with the native browser
   PiP external API (showPiP/hidePiP), including its matching web/client assets.
   Do not mix a newer external_api.js with an older meeting client. Keep the
   deployment's JWT, domain, Prosody, recording, and networking settings intact.
2. Start an Etherpad service with persistent storage and publish it over HTTPS.
   The official Docker Compose reference includes Etherpad plus PostgreSQL:
   https://github.com/ether/etherpad-lite/blob/develop/docker-compose.yml
   Set database/admin passwords in the deployment's secret configuration.
   Allow framing by the Jitsi origin and forward WebSocket connections.
3. Start Jitsi's collaboration backend using its official Dockerfile:
   https://github.com/jitsi/excalidraw-backend
   Publish its application port over HTTPS with WebSocket forwarding. Keep its
   metrics port internal. Configure access and persistence for the deployment's
   needs; these services have their own access boundaries.
4. Merge the following into the Jitsi server's existing custom-config.js, using
   the actual public service and app domains:

```js
config.pip = {
  ...config.pip,
  enableBrowserPiP: true,
  disabled: false,
  showToolbarButton: true
};
config.etherpad_base = 'https://pad.example.com/p/';
config.whiteboard = {
  ...config.whiteboard,
  enabled: true,
  collabServerBaseUrl: 'https://whiteboard.example.com'
};
config.sharedVideoAllowedURLDomains = [...new Set([
  ...(config.sharedVideoAllowedURLDomains || []),
  'youtube.com', 'www.youtube.com', 'youtu.be', 'app.example.com'
])];
```

Configure these service URLs on the Jitsi server because some integration keys
are not accepted as iframe overrides in every release. The optional Next.js
build variables below provide corresponding overrides for releases supporting
them. Rebuild/restart the app after changing NEXT_PUBLIC variables:

```dotenv
NEXT_PUBLIC_JITSI_ETHERPAD_URL=https://pad.example.com/p/
NEXT_PUBLIC_JITSI_WHITEBOARD_URL=https://whiteboard.example.com
```

The backend URLs above are examples, not existing services. No telephone/SIP
integration is included.

## Deployment acceptance checks

Use two independent browser profiles with camera and microphone permissions:

1. Present a tab with audio; confirm the other attendee sees/hears it and both
   can retain participant thumbnails in presentation view.
2. Share an embeddable YouTube video; play, pause, and seek from the presenting
   attendee and confirm the other attendee follows.
3. Upload audio/video and present from a different attendee's Files panel. Repeat
   playback checks. Upload PNG/JPEG and PPT/PPTX; open the viewer, share its tab,
   and confirm everyone sees the image or the presenter's slide navigation.
4. Open/close PiP manually, change tabs, return, and hang up; verify no duplicate
   conference audio or orphan floating window. Test target browsers separately.
5. Open the native whiteboard and shared document on both profiles and verify
   concurrent edits. Confirm rooms don't share the same document accidentally.
6. As moderator, create/join/close a breakout room and return without triggering
   the app's final-leave redirect. Verify lobby/password and background controls.

Local automated checks mock the Jitsi external API; they do not replace these
checks against the upgraded server and running collaboration services.
