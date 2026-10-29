/** Jitsi toolbar keys the app intercepts through the iframe API. */
export const JITSI_SHARED_VIDEO_BUTTON = 'sharedvideo';
export const JITSI_RECORDING_BUTTON = 'recording';

/** Native Jitsi controls, shared by the room and the standalone embed. */
export function getJitsiToolbarButtons(chatEnabled = true, recordingEnabled = false) {
  return [
    'microphone', 'camera', 'desktop', 'shareaudio', JITSI_SHARED_VIDEO_BUTTON,
    ...(recordingEnabled ? [JITSI_RECORDING_BUTTON] : []),
    'fullscreen', 'hangup', ...(chatEnabled ? ['chat'] : []),
    'settings', 'select-background', 'noisesuppression', 'raisehand',
    'tileview', 'participants-pane', 'stats', 'shortcuts', 'security',
    'download', 'invite', 'etherpad', 'whiteboard',
  ];
}

interface JitsiFeatureOptions {
  /** Route Jitsi's Share video button to the Melanam playlist panel. */
  sharedVideoPlaylist?: boolean;
  /** Reveal Jitsi's recording button and route it to server recording. */
  recordingEnabled?: boolean;
}

export function getJitsiFeatureConfig({
  sharedVideoPlaylist = false,
  recordingEnabled = false,
}: JitsiFeatureOptions = {}) {
  const etherpad = process.env.NEXT_PUBLIC_JITSI_ETHERPAD_URL;
  const whiteboard = process.env.NEXT_PUBLIC_JITSI_WHITEBOARD_URL;
  // String entries both suppress Jitsi's own dialog and notify the iframe API.
  // Object form is only understood by newer Jitsi releases, so keep strings.
  const interceptedButtons = [
    ...(sharedVideoPlaylist ? [JITSI_SHARED_VIDEO_BUTTON] : []),
    ...(recordingEnabled ? [JITSI_RECORDING_BUTTON] : []),
  ];
  return {
    pip: { enableBrowserPiP: true, disabled: false, showToolbarButton: true },
    sharedVideoAllowedURLDomains: [
      'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be',
      ...(typeof window !== 'undefined' && window.location?.hostname ? [window.location.hostname] : []),
    ],
    filmstrip: { disabled: false, disableResizable: false, disableStageFilmstrip: false },
    tileView: { disabled: false },
    disableVirtualBackground: false,
    virtualBackground: { disabled: false, disableAddingImages: false },
    disableReactions: false,
    disablePolls: false,
    hideAddRoomButton: false,
    breakoutRooms: { hideAddRoomButton: false, hideAutoAssignButton: false, hideJoinRoomButton: false },
    participantsPane: { enabled: true, hideModeratorSettingsTab: false, hideMoreActionsButton: false, hideMuteAllButton: false },
    ...(interceptedButtons.length ? { buttonsWithNotifyClick: interceptedButtons } : {}),
    // Melanam performs the recording server-side; Jitsi only needs to show the
    // native button so participants can trigger it from the meeting toolbar.
    ...(recordingEnabled ? { recordingService: { enabled: true, sharingEnabled: false } } : {}),
    ...(etherpad ? { etherpad_base: etherpad.replace(/\/?$/, '/') } : {}),
    ...(whiteboard ? { whiteboard: { enabled: true, collabServerBaseUrl: whiteboard } } : {}),
  };
}

export const JITSI_PRESENT_EVENT = 'melanam:jitsi-present';
export const JITSI_SCREEN_PRESENT_EVENT = 'melanam:jitsi-present-screen';
export const JITSI_PLAYLIST_PLAY_EVENT = 'melanam:jitsi-playlist-play';
export const JITSI_PLAYLIST_STOP_EVENT = 'melanam:jitsi-playlist-stop';

export function getSharedVideoUrl(path: string, origin: string) {
  const url = new URL('/api/files/download', origin);
  url.searchParams.set('path', path);
  url.searchParams.set('preview', '1');
  return url.href;
}

