'use client';

import { useEffect } from 'react';
import { JITSI_PRESENT_EVENT, JITSI_SCREEN_PRESENT_EVENT, JITSI_DOCUMENT_PRESENT_EVENT, getSharedVideoUrl } from '@/lib/jitsi-features';
import { getPresentationKind } from '@/lib/shared-file-types';

interface Props { api: any; meetingId: string; participantKey: string }

/** Connect uploads to Jitsi's native stage without adding another toolbar. */
export default function JitsiPresentationControls({ api, meetingId, participantKey }: Props) {
  useEffect(() => {
    if (!api) return;
    let joinedMeeting = false;
    const joined = () => { joinedMeeting = true; };
    const closed = () => { joinedMeeting = false; };
    const present = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!joinedMeeting || detail?.meetingId !== meetingId || typeof detail?.path !== 'string') return;
      try {
        const kind = getPresentationKind(detail.name || 'video.mp4');
        if (!kind) return;
        if (kind !== 'media') {
          const viewerEvent = new CustomEvent(JITSI_DOCUMENT_PRESENT_EVENT, {
            cancelable: true,
            detail: { path: detail.path, name: detail.name },
          });
          window.dispatchEvent(viewerEvent);
          if (!viewerEvent.defaultPrevented) {
            detail.message = 'The in-room presentation viewer is unavailable. Refresh the meeting and try again.';
            return;
          }
          detail.message = 'Presentation opened in the meeting window.';
          event.preventDefault();
          return;
        }
        api.executeCommand('startShareVideo', getSharedVideoUrl(detail.path, window.location.origin));
        event.preventDefault();
        api.executeCommand('setTileView', false);
      } catch {
        // The Files panel reports an unhandled request to the participant.
      }
    };
    const shareScreen = (event: Event) => {
      if (!joinedMeeting || (event as CustomEvent).detail?.meetingId !== meetingId) return;
      try {
        api.executeCommand('setTileView', false);
        api.executeCommand('toggleShareScreen', { enable: true });
        event.preventDefault();
      } catch { /* The viewer reports that the meeting is unavailable. */ }
    };
    api.addEventListener('videoConferenceJoined', joined);
    api.addEventListener('readyToClose', closed);
    window.addEventListener(JITSI_PRESENT_EVENT, present);
    window.addEventListener(JITSI_SCREEN_PRESENT_EVENT, shareScreen);
    return () => {
      api.removeListener?.('videoConferenceJoined', joined);
      api.removeListener?.('readyToClose', closed);
      window.removeEventListener(JITSI_PRESENT_EVENT, present);
      window.removeEventListener(JITSI_SCREEN_PRESENT_EVENT, shareScreen);
    };
  }, [api, meetingId, participantKey]);

  return null;
}
