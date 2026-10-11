import { InfoPage } from '../info-pages';

export default function AboutPage() {
  return <InfoPage {...{
  "eyebrow": "About us",
  "title": "Meet. Teach. Remember.",
  "description": "Melanam is a secure workspace for live video meetings, online learning, and the intelligence that carries work forward after the call ends.",
  "ctaHref": "mailto:gdnvision360@gmail.com",
  "ctaLabel": "Get in touch",
  "sections": [
    {
      "title": "One connected record",
      "body": "Most video tools stop at “End meeting.” The recording lands in one place, the notes in another, the files somewhere else, and the follow-up tasks get lost. Melanam was built to close that gap. Every session, whether a live class, a team call, or a seminar, becomes one connected record: the video, the transcript, the AI-generated summary, the shared files, the decisions, and the next actions."
    },
    {
      "title": "What we do",
      "body": "Melanam combines three things that are usually separate products:",
      "items": [
        "Video meetings: private rooms with invite links, recording, livestreaming, live captions, whiteboards, and polls.",
        "Learning management (LMS): role-aware courses, sessions, assignments, and resources for instructors and students.",
        "AI meeting memory: transcripts, summaries, decisions, and action items captured automatically after every session."
      ]
    },
    {
      "title": "One record for every session",
      "body": "Nothing that happens live should disappear. Recordings, transcripts, files, and follow-ups stay together and stay connected to the course or project they belong to."
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
      "body": "A session is a starting point. Melanam helps you return to the lesson outline, the assigned task, or the decision that was made."
    },
    {
      "title": "Who Melanam is for",
      "body": "A workspace for learning and working together.",
      "items": [
        "Educators and institutions running live classes, cohorts, and courses",
        "Trainers and coaches delivering seminars and workshops",
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
