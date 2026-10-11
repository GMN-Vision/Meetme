import { InfoPage } from '../info-pages';

export default function DocumentationPage() {
  return <InfoPage {...{
    eyebrow: 'Documentation',
    title: 'Meet. Connect. Remember.',
    description: 'A practical guide to starting meetings, using room tools, and finding recordings and AI meeting notes.',
    ctaHref: '/help-center',
    ctaLabel: 'Visit the Help Center',
    sections: [
      {
        title: 'Getting started',
        body: 'Sign in or create an account, then open the Meetings workspace.',
        items: [
          'Use a modern browser such as Chrome, Edge, Firefox, or Safari.',
          'Allow camera and microphone access when you want to speak on video.',
          'Use a stable internet connection.',
          'Check the Pricing page for current plans and feature availability.'
        ]
      },
      {
        title: 'Start, create, or join a meeting',
        body: 'Open /meetings to manage your meetings.',
        items: [
          'Select Start meeting to open an instant room.',
          'Select Create meeting to give the room a title and optional agenda, then select Create room.',
          'Select Join meeting and enter a room code or paste a complete invite link.',
          'Use a recent meeting card to reopen a room or copy its invite link.'
        ]
      },
      {
        title: 'In the meeting room',
        body: 'Room controls are in the meeting toolbar. The controls available to you can depend on your role and plan.',
        items: [
          'Copy link copies the invite link for the room.',
          'Record starts or stops recording. Only the host can control recording.',
          'Whiteboard opens the shared whiteboard.',
          'Files opens the file sharing panel; access may require an active plan.',
          'Live captions may require a Pro plan.'
        ]
      },
      {
        title: 'Recordings',
        body: 'Open /meetings/recordings to find recordings available to your account.',
        items: [
          'A recording appears after the host records and ends the meeting and processing finishes.',
          'Select Watch or Download when a recording is ready.',
          'Hosts can share a recording with the meeting group or delete their recording.',
          'A recording that is processing, expired, or deleted may not be available to watch.'
        ]
      },
      {
        title: 'AI meeting notes',
        body: 'Open /meetings/notes to review notes from processed meetings.',
        items: [
          'Notes can include a summary, key points, decisions, action items, and transcript lines.',
          'Processing starts after the meeting and may take a few minutes.',
          'Download the transcript when transcript lines are available.',
          'Review AI-generated notes for accuracy before sharing them.'
        ]
      },
      {
        title: 'Get better meeting notes',
        body: 'Clear audio helps produce a more useful transcript and summary.',
        items: [
          'Use a good microphone and reduce background noise.',
          'Speak one at a time where possible.',
          'Say decisions and next steps clearly.',
          'Tell participants when a meeting is being recorded or transcribed.'
        ]
      },
      {
        title: 'Privacy and access',
        body: 'Meeting rooms use invite links and account access controls.',
        items: [
          'Share invite links only with intended participants.',
          'Sign in with the account that has access to the meeting.',
          'Meeting controls and saved content may vary by role and plan.'
        ]
      },
      {
        title: 'Troubleshooting',
        body: 'If you have trouble joining or using meeting tools, try these steps.',
        items: [
          'Check that the invite link is complete and that you are signed in to the right account.',
          'Check browser camera and microphone permissions and select the right devices.',
          'If others cannot hear you, check that your microphone is not muted.',
          'For choppy audio or video, use a stronger connection or turn off your video.',
          'If notes or a recording are missing, wait for processing to finish and check again.'
        ]
      },
      {
        title: 'Support',
        body: 'Visit the Help Center or contact gmnnetwork@gmail.com. Melanam is a product of Global Development Networks Ltd.'
      }
    ]
  }} />;
}
