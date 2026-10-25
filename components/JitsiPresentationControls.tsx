'use client';

import { useEffect } from 'react';
import { JITSI_PRESENT_EVENT, getSharedVideoUrl } from '@/lib/jitsi-features';

interface Props { api: any; meetingId: string }

/** Connect uploads to Jitsi's native stage without adding another toolbar. */
export default function JitsiPresentationControls({ api, meetingId }: Props) {
  useEffect(() => {
    if (!api) return;
    let joinedMeeting = false;
    const joined = () => { joinedMeeting = true; };
    const closed = () => { joinedMeeting = false; };
    const present = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!joinedMeeting || detail?.meetingId !== meetingId || typeof detail?.path !== 'string') return;
      try {
        api.executeCommand('startShareVideo', getSharedVideoUrl(detail.path, window.location.origin));
        event.preventDefault();
        api.executeCommand('setTileView', false);
      } catch {
        // The Files panel reports an unhandled request to the participant.
      }
    };
    api.addEventListener('videoConferenceJoined', joined);
    api.addEventListener('readyToClose', closed);
    window.addEventListener(JITSI_PRESENT_EVENT, present);
    return () => {
      api.removeListener?.('videoConferenceJoined', joined);
      api.removeListener?.('readyToClose', closed);
      window.removeEventListener(JITSI_PRESENT_EVENT, present);
    };
  }, [api, meetingId]);

  return null;
}
