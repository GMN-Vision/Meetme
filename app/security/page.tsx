import { InfoPage } from '../info-pages';

export default function SecurityPage() {
  return <InfoPage {...{
    eyebrow: 'Security',
    title: 'Security is part of every meeting.',
    description: 'Melanam uses account sign-in, room access checks, host controls, and plan-based limits to help protect meetings and recordings. Here is how those controls work and which service providers process data.',
    ctaHref: 'mailto:gmnnetwork@gmail.com',
    ctaLabel: 'Contact support',
    sections: [
      {
        title: 'Account sign-in',
        body: 'Meeting workspaces and saved recordings require a signed-in account. Sign-in uses email verification links, and account sessions are managed by Melanam.'
      },
      {
        title: 'Room access',
        body: 'Meeting rooms use invite links and access checks. A room must exist and be started by its host before participants can join. Private rooms use signed access tokens, and participant limits are enforced according to the host plan.',
        items: [
          'Share invite links only with people you intend to join.',
          'Do not post private room links publicly.',
          'Use the correct account if a meeting requires account access.'
        ]
      },
      {
        title: 'Host controls and permissions',
        body: 'Only the meeting host can start or stop server recording. The host controls whether a recording is shared with the meeting group and can delete their recording. Some tools and limits depend on the account plan.'
      },
      {
        title: 'Recording storage and retention',
        body: 'Meeting recordings are stored in the configured Supabase storage account and are subject to plan-based storage, recording-time, and retention limits. When a recording reaches its retention date, it is marked expired and removed from normal playback and sharing. See Pricing for the current limits on each plan.'
      },
      {
        title: 'Service providers and AI processing',
        body: 'Some Melanam features send data to service providers to work. Live meeting audio/video uses the configured Jitsi service. Captions and transcription use AssemblyAI. AI-generated meeting notes use AssemblyAI and OpenAI. Server recordings are stored in the configured Supabase storage account. Account and meeting records are stored in MongoDB.',
        items: [
          'The help chatbot sends your question and recent chat messages to Google Gemini to generate an answer.',
          'The chatbot does not automatically receive your meeting recording or transcript. Do not paste private meeting content, passwords, or API keys into the chat.',
          'Review generated transcripts and AI notes before sharing them.'
        ]
      },
      {
        title: 'Your part in keeping meetings private',
        body: 'Use Melanam thoughtfully and let participants know when recording or transcription is active.',
        items: [
          'Keep your sign-in email account secure.',
          'Share recordings and meeting notes only with the intended audience.',
          'Check that the right people have access before sharing a room link or recording.'
        ]
      },
      {
        title: 'Certifications',
        body: 'Melanam does not currently hold an independent security certification. We do not claim SOC 2 or ISO 27001 certification.'
      },
      {
        title: 'Security questions',
        body: 'For security questions or to report a concern, contact gmnnetwork@gmail.com.'
      }
    ]
  }} />;
}
