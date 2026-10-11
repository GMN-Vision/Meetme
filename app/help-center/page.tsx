import { InfoPage } from '../info-pages';

export default function HelpCenterPage() {
  return <InfoPage {...{
  "eyebrow": "Help center",
  "title": "Help with your next session.",
  "description": "Troubleshooting and answers for Melanam meetings, recordings, and AI notes.",
  "ctaHref": "mailto:gmnnetwork@gmail.com",
  "ctaLabel": "Email support",
  "sections": [
    {
      "title": "Can’t hear or see others",
      "body": "Check your device volume and output selection. Refresh the page and rejoin."
    },
    {
      "title": "Others can’t hear me",
      "body": "Confirm the microphone isn’t muted and that the browser has microphone permission."
    },
    {
      "title": "Camera not detected",
      "body": "Close other apps using the camera, then allow camera access in your browser settings."
    },
    {
      "title": "Choppy video or audio",
      "body": "Switch to a stronger connection, turn off your video, or close bandwidth-heavy apps."
    },
    {
      "title": "Can’t join a room",
      "body": "Confirm the invite link is complete and that you’re signed in with the correct account."
    },
    {
      "title": "Captions not appearing",
      "body": "Make sure captions are enabled for the session and that audio is clear."
    },
    {
      "title": "Summary or transcript missing",
      "body": "Processing begins after the session ends and can take a few minutes. Check again shortly."
    },
    {
      "title": "What can I use Melanam for?",
      "body": "Use Melanam for team calls, seminars, workshops, and other meetings where you want a recording or notes to revisit later."
    },
    {
      "title": "Are all sessions recorded automatically?",
      "body": "Recording is a setting that hosts control."
    },
    {
      "title": "When are AI notes ready?",
      "body": "Shortly after the session ends. A live summary may also appear during the session."
    },
    {
      "title": "Support",
      "body": "Contact: gmnnetwork@gmail.com. Melanam is a product of Global Development Networks Ltd."
    }
  ]
}} />;
}
