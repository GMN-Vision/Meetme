import { InfoPage } from '../info-pages';

export default function DocumentationPage() {
  return (
    <InfoPage
      eyebrow="Documentation"
      title="Guides for running video meetings."
      description="Documentation for creating rooms, running live sessions, sharing files, and using AI meeting notes."
      sections={[
        { title: 'Getting started', body: 'Sign in with your email, open Meetings, and start a call or join with an invite link.' },
        { title: 'Live meetings', body: 'Use invite links, captions, files, whiteboards, recordings, polls, feedback, and livestream controls inside meeting rooms.' },
        { title: 'Recordings and notes', body: 'Find your recordings and shared recordings in the Recordings tab. Review AI summaries and transcripts in Meeting notes.' },
        { title: 'Administration', body: 'Admins can manage users, organizations, subscriptions, meetings, and platform activity from the system console.' },
      ]}
    />
  );
}
