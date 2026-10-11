# Jitsi Components & Utilities

This directory contains all components and utilities for integrating your self-hosted Jitsi Meet server.

## Quick Reference

### Components

- **`JitsiMeeting.tsx`** - Core component for embedding Jitsi meetings
- **`JitsiMeetingContainer.tsx`** - Wrapper with loading and error states

### Hooks

- **`useJitsiMeeting`** - Utilities for room names, display names, and validation

### Utilities

- **`lib/jitsi.ts`** - Configuration helpers and presets

## Usage Examples

### Basic Meeting Room

```tsx
import { JitsiMeeting } from '@/components/JitsiMeeting';

export function MeetingPage() {
  return (
    <JitsiMeeting
      roomName="meeting-123"
      displayName="John Doe"
      height="100%"
    />
  );
}
```

### With Loading and Error Handling

```tsx
import { JitsiMeetingContainer } from '@/components/JitsiMeetingContainer';
import { useState } from 'react';

export function MeetingWithState() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <JitsiMeetingContainer
      roomName="meeting-123"
      displayName="John Doe"
      isLoading={isLoading}
      error={error}
      onRetry={() => window.location.reload()}
      onReadyToClose={() => console.log('Meeting ended')}
    />
  );
}
```

### Using useJitsiMeeting Hook

```tsx
import { useJitsiMeeting } from '@/hooks/useJitsiMeeting';

export function CreateMeeting() {
  const { generateRoomName, formatDisplayName } = useJitsiMeeting();
  
  const handleCreateMeeting = () => {
    const roomId = generateRoomName();
    const displayName = formatDisplayName(userInput);
    
    // Use roomId and displayName with JitsiMeeting component
  };
}
```

### Using Configuration Presets

```tsx
import { CONFIG_PRESETS, TOOLBAR_PRESETS } from '@/lib/jitsi';
import { JitsiMeeting } from '@/components/JitsiMeeting';

export function ClassroomMeeting() {
  return (
    <JitsiMeeting
      roomName="classroom-101"
      displayName="Host"
      {...CONFIG_PRESETS.classroom}
      toolbarButtons={TOOLBAR_PRESETS.host}
    />
  );
}
```

## Configuration Presets

### Toolbar Presets

- **`minimal`** - Just audio, video, and hangup
- **`standard`** - Audio, video, screen share, chat
- **`full`** - All features
- **`host`** - Full features + recording + streaming

### Config Presets

- **`development`** - Default settings, audio/video enabled
- **`classroom`** - Prejoin page, audio muted initially
- **`webinar`** - Audio/video muted, prejoin required
- **`recording`** - Optimized for recording

## Environment Variables

```bash
# Your self-hosted Jitsi domain
NEXT_PUBLIC_JITSI_DOMAIN=meet.melanam.com
```

## Integration Points

### In Room Page

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { JitsiMeeting } from '@/components/JitsiMeeting';

export default function RoomPage() {
  const params = useParams();
  const { user } = useUser();
  
  return (
    <JitsiMeeting
      roomName={params.id as string}
      displayName={user?.firstName || 'Guest'}
      userEmail={user?.emailAddresses[0]?.emailAddress}
      onReadyToClose={() => router.push('/meetings')}
    />
  );
}
```

### In Modal/Dialog

```tsx
import { JitsiMeetingContainer } from '@/components/JitsiMeetingContainer';

export function MeetingModal({ isOpen, roomId, onClose }) {
  return isOpen ? (
    <div className="fixed inset-0 z-50 bg-black/50">
      <div className="absolute inset-4 bg-white rounded-lg overflow-hidden">
        <JitsiMeetingContainer
          roomName={roomId}
          displayName="User"
          height="100%"
          onReadyToClose={onClose}
        />
      </div>
    </div>
  ) : null;
}
```

## Best Practices

1. **Always set displayName** - Don't rely on defaults for professional meetings
2. **Use toolbarButtons** - Customize based on use case (classroom, webinar, etc)
3. **Handle onReadyToClose** - Provide navigation or cleanup when user leaves
4. **Test with custom domain** - Verify `NEXT_PUBLIC_JITSI_DOMAIN` is set correctly
5. **Monitor console** - Check browser console for configuration errors

## Troubleshooting

### "Cannot read property JitsiMeetExternalAPI"

Make sure the external API script loaded:
- Check browser DevTools Network tab
- Verify domain in `NEXT_PUBLIC_JITSI_DOMAIN`
- Check that domain is accessible

### Video/Audio Not Working

- Verify browser permissions (camera/microphone)
- Check if started with `startWithVideoMuted={true}`
- Test UDP port 10000 on your server

### Domain Not Loading

```tsx
import { validateJitsiDomain } from '@/lib/jitsi';

// Test if domain is accessible
const isValid = await validateJitsiDomain('meet.melanam.com');
```

## Component Reference

### JitsiMeeting Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `roomName` | string | - | Meeting room ID (required) |
| `displayName` | string | "Guest" | User's display name |
| `userEmail` | string | - | User's email |
| `domain` | string | env var | Jitsi domain |
| `onReady` | function | - | Callback when joined |
| `onReadyToClose` | function | - | Callback when leaving |
| `startWithAudioMuted` | boolean | false | Mute audio on start |
| `startWithVideoMuted` | boolean | false | Mute video on start |
| `prejoinPageEnabled` | boolean | false | Show prejoin screen |
| `toolbarButtons` | string[] | [standard] | Buttons to display |
| `showLogo` | boolean | false | Show Jitsi logo |
| `height` | string | "100%" | Container height |
| `className` | string | "" | CSS class |

## Resources

- [Full Jitsi Integration Guide](../JITSI_INTEGRATION_GUIDE.md)
- [Jitsi Handbook](https://jitsi.github.io/handbook/)
- [Docker Jitsi Setup](https://github.com/jitsi/docker-jitsi-meet)
