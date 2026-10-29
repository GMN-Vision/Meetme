'use client';

import { useEffect } from 'react';
import {
  JITSI_PLAYLIST_PLAY_EVENT,
  JITSI_PLAYLIST_STOP_EVENT,
  JITSI_PRESENT_EVENT,
  JITSI_RECORDING_BUTTON,
  JITSI_SCREEN_PRESENT_EVENT,
  JITSI_SHARED_VIDEO_BUTTON,
  getSharedVideoUrl,
} from '@/lib/jitsi-features';
import { getPresentationKind } from '@/lib/shared-file-types';
import { normalizeVideoUrl } from '@/lib/video-playlist';

interface Props {
  api: any;
  meetingId: string;
  participantKey: string;
  /** Open the app playlist when Jitsi's Share video button is pressed. */
  onPlaylistRequested?: () => void;
  /** Toggle Melanam server recording when Jitsi's recording button is pressed. */
  onRecordingRequested?: () => void;
}

/** Connect uploads to Jitsi's native stage without adding another toolbar. */
export default function JitsiPresentationControls({
  api,
  meetingId,
  participantKey,
  onPlaylistRequested,
  onRecordingRequested,
}: Props) {
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
          const viewer = new URL('/present', window.location.origin);
          viewer.searchParams.set('path', detail.path);
          viewer.searchParams.set('name', detail.name);
          viewer.searchParams.set('meetingId', meetingId);
          viewer.searchParams.set('participantKey', participantKey);
          const popup = window.open(viewer.href, '_blank');
          if (!popup) { detail.message = 'Allow pop-ups to open the presentation viewer.'; return; }
          detail.message = 'Presentation opened. Use Share in meeting in the viewer, then select its tab or window.';
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
    const playPlaylistVideo = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!joinedMeeting || detail?.meetingId !== meetingId || typeof detail?.url !== 'string') return;
      const url = normalizeVideoUrl(detail.url);
      if (!url) return;
      try {
        api.executeCommand('startShareVideo', url);
        api.executeCommand('setTileView', false);
        detail.message = 'Video started in the meeting.';
        event.preventDefault();
      } catch {
        detail.message = 'The meeting is not ready to play videos yet.';
      }
    };
    const stopPlaylistVideo = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!joinedMeeting || detail?.meetingId !== meetingId) return;
      try {
        api.executeCommand('stopShareVideo');
        event.preventDefault();
      } catch { /* The meeting reports that shared video is unavailable. */ }
    };
    // buttonsWithNotifyClick makes Jitsi report its own toolbar presses
    // instead of running the built-in Share video dialog or recorder.
    const toolbarButtonClicked = (event: { key?: string; button?: string }) => {
      if (!joinedMeeting) return;
      const key = event?.key || event?.button;
      if (key === JITSI_SHARED_VIDEO_BUTTON) onPlaylistRequested?.();
      if (key === JITSI_RECORDING_BUTTON) onRecordingRequested?.();
    };
    api.addEventListener('videoConferenceJoined', joined);
    api.addEventListener('readyToClose', closed);
    api.addEventListener('toolbarButtonClicked', toolbarButtonClicked);
    window.addEventListener(JITSI_PRESENT_EVENT, present);
    window.addEventListener(JITSI_SCREEN_PRESENT_EVENT, shareScreen);
    window.addEventListener(JITSI_PLAYLIST_PLAY_EVENT, playPlaylistVideo);
    window.addEventListener(JITSI_PLAYLIST_STOP_EVENT, stopPlaylistVideo);
    return () => {
      api.removeListener?.('videoConferenceJoined', joined);
      api.removeListener?.('readyToClose', closed);
      api.removeListener?.('toolbarButtonClicked', toolbarButtonClicked);
      window.removeEventListener(JITSI_PRESENT_EVENT, present);
      window.removeEventListener(JITSI_SCREEN_PRESENT_EVENT, shareScreen);
      window.removeEventListener(JITSI_PLAYLIST_PLAY_EVENT, playPlaylistVideo);
      window.removeEventListener(JITSI_PLAYLIST_STOP_EVENT, stopPlaylistVideo);
    };
  }, [api, meetingId, participantKey, onPlaylistRequested, onRecordingRequested]);

  return null;
}
