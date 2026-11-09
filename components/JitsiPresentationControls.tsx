'use client';

import { useEffect } from 'react';
import {
  JITSI_PLAYLIST_PLAY_EVENT,
  JITSI_PLAYLIST_STOP_EVENT,
  JITSI_HANGUP_BUTTON,
  JITSI_PRESENT_EVENT,
  JITSI_RECORDING_BUTTON,
  JITSI_SCREEN_SHARE_BUTTON,
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
  /** Leave through the app so the host can finish the meeting safely. */
  onHangupRequested?: () => void;
  /** Publish a document to the in-room viewer. */
  onDocumentRequested?: (path: string, approvalId?: string) => Promise<void>;
  onScreenRequested?: () => void;
}

/** Connect uploads to Jitsi's native stage without adding another toolbar. */
export default function JitsiPresentationControls({
  api,
  meetingId,
  participantKey,
  onPlaylistRequested,
  onRecordingRequested,
  onHangupRequested,
  onDocumentRequested,
  onScreenRequested,
}: Props) {
  useEffect(() => {
    if (!api) return;
    let joinedMeeting = false;
    let meetingClosed = false;
    let sharingVideo = false;
    const joined = () => { joinedMeeting = true; meetingClosed = false; };
    const closed = () => { joinedMeeting = false; meetingClosed = true; sharingVideo = false; };
    const startVideo = (url: string) => {
      if (sharingVideo) {
        api.executeCommand('stopShareVideo');
        sharingVideo = false;
      }
      api.executeCommand('startShareVideo', url);
      sharingVideo = true;
      api.executeCommand('setTileView', false);
    };
    const present = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!joinedMeeting || detail?.meetingId !== meetingId || typeof detail?.path !== 'string') return;
      try {
        const kind = getPresentationKind(detail.name || 'video.mp4');
        if (!kind) return;
        if (kind !== 'media') {
          if (!onDocumentRequested) return;
          void onDocumentRequested(detail.path, detail.approvalId);
          detail.message = 'Opening the document in the meeting for everyone.';
          event.preventDefault();
          return;
        }
        startVideo(getSharedVideoUrl(detail.path, window.location.origin));
        event.preventDefault();
      } catch {
        // The Files panel reports an unhandled request to the participant.
      }
    };
    const playPlaylistVideo = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (meetingClosed || detail?.meetingId !== meetingId || typeof detail?.url !== 'string') return;
      const url = normalizeVideoUrl(detail.url);
      if (!url) return;
      try {
        startVideo(url);
        detail.message = 'Video started in the meeting.';
        event.preventDefault();
      } catch {
        detail.message = 'The meeting is not ready to play videos yet.';
      }
    };
    const stopPlaylistVideo = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (meetingClosed || detail?.meetingId !== meetingId) return;
      try {
        api.executeCommand('stopShareVideo');
        sharingVideo = false;
        event.preventDefault();
      } catch { /* The meeting reports that shared video is unavailable. */ }
    };
    // buttonsWithNotifyClick makes Jitsi report its own toolbar presses
    // instead of running the built-in Share video dialog or recorder.
    const toolbarButtonClicked = (event: { key?: string; button?: string }) => {
      const key = event?.key || event?.button;
      if (key === JITSI_SHARED_VIDEO_BUTTON) onPlaylistRequested?.();
      if (key === JITSI_RECORDING_BUTTON) onRecordingRequested?.();
      if (key === JITSI_HANGUP_BUTTON) onHangupRequested?.();
      if (key === JITSI_SCREEN_SHARE_BUTTON) onScreenRequested?.();
    };
    api.addEventListener('videoConferenceJoined', joined);
    api.addEventListener('readyToClose', closed);
    api.addEventListener('toolbarButtonClicked', toolbarButtonClicked);
    window.addEventListener(JITSI_PRESENT_EVENT, present);
    window.addEventListener(JITSI_PLAYLIST_PLAY_EVENT, playPlaylistVideo);
    window.addEventListener(JITSI_PLAYLIST_STOP_EVENT, stopPlaylistVideo);
    return () => {
      api.removeListener?.('videoConferenceJoined', joined);
      api.removeListener?.('readyToClose', closed);
      api.removeListener?.('toolbarButtonClicked', toolbarButtonClicked);
      window.removeEventListener(JITSI_PRESENT_EVENT, present);
      window.removeEventListener(JITSI_PLAYLIST_PLAY_EVENT, playPlaylistVideo);
      window.removeEventListener(JITSI_PLAYLIST_STOP_EVENT, stopPlaylistVideo);
    };
  }, [api, meetingId, participantKey, onPlaylistRequested, onRecordingRequested, onHangupRequested, onDocumentRequested, onScreenRequested]);

  return null;
}
