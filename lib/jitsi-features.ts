/** Native Jitsi controls, shared by the room and the standalone embed. */
export function getJitsiToolbarButtons(chatEnabled = true) {
  return [
    'microphone', 'camera', 'desktop', 'shareaudio', 'sharedvideo',
    'fullscreen', 'hangup', ...(chatEnabled ? ['chat'] : []),
    'settings', 'select-background', 'noisesuppression', 'raisehand',
    'tileview', 'participants-pane', 'stats', 'shortcuts', 'security',
    'download', 'invite', 'etherpad', 'whiteboard',
  ];
}

export function getJitsiFeatureConfig() {
  const etherpad = process.env.NEXT_PUBLIC_JITSI_ETHERPAD_URL;
  const whiteboard = process.env.NEXT_PUBLIC_JITSI_WHITEBOARD_URL;
  return {
    pip: { enableBrowserPiP: true, disabled: false, showToolbarButton: true },
    sharedVideoAllowedURLDomains: [
      'youtube.com', 'www.youtube.com', 'youtu.be',
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
    ...(etherpad ? { etherpad_base: etherpad.replace(/\/?$/, '/') } : {}),
    ...(whiteboard ? { whiteboard: { enabled: true, collabServerBaseUrl: whiteboard } } : {}),
  };
}

export const JITSI_PRESENT_EVENT = 'melanam:jitsi-present';
export const JITSI_SCREEN_PRESENT_EVENT = 'melanam:jitsi-present-screen';

export function getSharedVideoUrl(path: string, origin: string) {
  const url = new URL('/api/files/download', origin);
  url.searchParams.set('path', path);
  url.searchParams.set('preview', '1');
  return url.href;
}
