import { InfoPage } from '../info-pages';

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="About us"
      title="About Melanam."
      description="Melanam is an AI-powered video conferencing and collaboration platform from Global Development Networks Ltd, designed for secure, intelligent, and scalable virtual meetings across businesses, educational institutions, and distributed teams."
      ctaHref="/pricing"
      ctaLabel="Explore plans"
      sections={[
        {
          title: 'Company Overview',
          body: 'Global Development Networks Ltd builds Melanam on self-hosted communication infrastructure, combining enterprise-grade security with modern collaboration workflows.',
        },
        {
          title: 'Mission',
          body: 'To simplify online collaboration by providing secure, AI-driven communication tools that enhance productivity while maintaining privacy, reliability, and full organizational control.',
        },
        {
          title: 'Vision',
          body: 'To become a next-generation collaboration platform where artificial intelligence assists teams before, during, and after every meeting, transforming conversations into actionable knowledge.',
        },
        {
          title: 'Why Melanam',
          body: 'Melanam brings meetings, shared files, recordings, and AI notes into one controlled workspace instead of scattering collaboration across disconnected tools.',
        },
        {
          title: 'Core Features',
          body: 'Teams can run secure video rooms and keep the meeting record connected to the work that follows.',
          items: ['Video conferencing', 'Live transcription', 'Meeting summaries', 'File collaboration', 'Whiteboarding', 'Intelligent meeting insights'],
        },
        {
          title: 'Technology Stack',
          body: 'The platform uses a modern SaaS stack with WebRTC meetings, authenticated dashboards, database-backed meeting history, and AI services for post-meeting intelligence.',
        },
        {
          title: 'Security Overview',
          body: 'Melanam is designed around encrypted communication, authenticated access, role-based administration, self-hosted conferencing infrastructure, and controlled file authorization.',
        },
        {
          title: 'AI Features',
          body: 'AI capabilities include live captions, transcription, summary generation, action items, key decisions, translations, and structured meeting insights.',
        },
        {
          title: 'Contact Section',
          body: 'For product, enterprise, support, or security inquiries, contact Global Development Networks Ltd through the Help Center while dedicated public support channels are finalized.',
        },
        {
          title: 'Copyright notice',
          body: '(c) 2036 Global Development Networks Ltd. All Rights Reserved.',
        },
      ]}
    />
  );
}
