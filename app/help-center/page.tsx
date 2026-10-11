import { InfoPage } from '../info-pages';

export default function HelpCenterPage() {
  return (
    <InfoPage
      eyebrow="Help center"
      title="Help for getting unstuck quickly."
      description="Find support topics for the most common Melanam meeting, collaboration, AI, and admin workflows."
      sections={[
        { title: 'Getting Started', body: 'Create an account, sign in, and open your workspace dashboard to begin using Melanam.' },
        { title: 'Creating Meetings', body: 'Start a new room from the Meetings page, then invite participants with the generated meeting link.' },
        { title: 'Joining Meetings', body: 'Use the shared meeting link and grant required browser permissions for camera, microphone, and screen sharing.' },
        { title: 'Sharing Files', body: 'Upload meeting resources and keep shared files connected to the active room context.' },
        { title: 'Whiteboard', body: 'Collaborate visually during a meeting with shared whiteboard tools and saved board state.' },
        { title: 'Live Captions', body: 'Enable captions when available to improve accessibility and produce transcript-ready meeting context.' },
        { title: 'AI Summaries', body: 'Review summaries, key notes, decisions, and action items after AI processing completes.' },
        { title: 'Recording', body: 'Use recording controls where enabled by your plan and organization policies.' },
        { title: 'Troubleshooting', body: 'Check browser permissions, network connectivity, supported plans, and deployment configuration when features do not load as expected.' },
        { title: 'Contact Support', body: 'For account, enterprise, security, or deployment support, contact Global Development Networks Ltd through your designated support channel.' },
      ]}
    />
  );
}
