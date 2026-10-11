import { InfoPage } from '../info-pages';

export default function AboutPage() {
  return <InfoPage {...{
  "eyebrow": "About us",
  "title": "Meet. Connect. Remember.",
  "description": "Melanam is a video meeting workspace with recordings, live captions, and AI-generated meeting notes.",
  "ctaHref": "mailto:gdnvision360@gmail.com",
  "ctaLabel": "Get in touch",
  "sections": [
    {
      "title": "One connected record",
      "body": "Most video tools stop at â€œEnd meeting.â€ The recording lands in one place, the notes in another, the files somewhere else, and the follow-up tasks get lost. Melanam was built to close that gap. Every session, whether a team call, seminar, or workshop, becomes one connected record: the video, the transcript, the AI-generated summary, the shared files, the decisions, and the next actions."
    },
    {
      "title": "What we do",
      "body": "Melanam brings meetings and follow-up together in one workspace:",
      "items": [
        "Video meetings: private rooms with invite links, recording, live captions, whiteboards, and file sharing.",
        "Meeting history: recordings and meeting notes stay available in your workspace after a session.",
        "AI meeting notes: summaries, transcripts, decisions, and action items help you keep track of what was discussed."
      ]
    },
    {
      "title": "One record for every session",
      "body": "Nothing that happens live should disappear. Recordings, transcripts, files, and follow-ups stay together and stay connected to the meeting or project they belong to."
    },
    {
      "title": "Private by design",
      "body": "Rooms are private, workspaces are controlled, and access is role-aware. People see what their role allows, nothing more."
    },
    {
      "title": "Intelligent by default",
      "body": "AI is built into the workflow instead of added on top. Summaries and action items appear without anyone having to take notes."
    },
    {
      "title": "Work continues after the call",
      "body": "A session is a starting point. Melanam helps you return to the key discussion points, follow-up actions, or decisions."
    },
    {
      "title": "Who Melanam is for",
      "body": "Melanam is for people who want their conversations and next steps in one place.",
      "items": [
        "Teams holding regular meetings",
        "People hosting seminars, workshops, and group conversations",
        "Teams that want meetings to produce clear outcomes",
        "Organisations that need controlled, role-based access to their sessions"
      ]
    },
    {
      "title": "The company",
      "body": "Melanam is a product of Global Development Networks Ltd."
    },
    {
      "title": "Get in touch",
      "body": "Email: gdnvision360@gmail.com",
      "items": [
        "Website: www.melanam.com",
        "Help Center: www.melanam.com/help-center"
      ]
    }
  ]
}} />;
}
