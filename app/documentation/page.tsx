import { InfoPage } from '../info-pages';

export default function DocumentationPage() {
  return <InfoPage {...{
  "eyebrow": "Documentation",
  "title": "Meet. Teach. Remember.",
  "description": "Melanam is a video meeting and LMS workspace. This guide explains how to set up your account, run meetings, teach courses, use AI notes, and manage what happens after a session.",
  "ctaHref": "/help-center",
  "ctaLabel": "Visit the Help Center",
  "sections": [
    {
      "title": "Getting started",
      "body": "Go to www.melanam.com and select Enter Melanam. Sign in or create an account, complete your profile, and choose your role if prompted. Your workspace is where you can start a room, join a session, or open a course.",
      "items": [
        "Use a modern browser such as Chrome, Edge, Firefox, or Safari.",
        "A working camera and microphone are optional for view-only participants.",
        "Use a stable internet connection.",
        "Plans and membership options are listed on the Pricing page."
      ]
    },
    {
      "title": "Core concepts",
      "body": "A workspace is your home area for meetings, courses, files, and history.",
      "items": [
        "Room: a private video space with its own invite link.",
        "Session: a single live event, such as a class or a team call, held in a room.",
        "Course: a structured set of sessions, assignments, and resources.",
        "Session record: recording, transcript, summary, files, decisions, and action items.",
        "Role: determines what a person can see and do."
      ]
    },
    {
      "title": "Meeting rooms",
      "body": "Open your workspace and select New room, or start a session from a course. Name the room, set options such as recording or captions, and select Start.",
      "items": [
        "Invite: copy the room’s private invite link and share it by email, chat, or calendar invite.",
        "Join: open the invite link, sign in if prompted, check your camera and microphone, and select Join.",
        "Leave: participants can leave at any time. A host or instructor can end the session."
      ]
    },
    {
      "title": "In-meeting tools",
      "body": "Collaborate without leaving the room.",
      "items": [
        "Shared whiteboard: draw, sketch, and explain ideas together in real time.",
        "Polls: check understanding, gather opinions, or make group decisions.",
        "File sharing: attach files to a session so everyone can access them.",
        "Participant controls: hosts can manage who speaks and who is visible."
      ]
    },
    {
      "title": "Recording, livestream and captions",
      "body": "Enable recording at the start of a session or while it is in progress. Recordings are saved with the session for later review alongside the transcript and summary. Let participants know when a session is being recorded.",
      "items": [
        "Livestream: broadcast a session to a wider audience.",
        "Live captions: display speech as text during the session to improve accessibility."
      ]
    },
    {
      "title": "AI meeting memory",
      "body": "After a session ends, Melanam produces a structured record. During a live session, a Live summary panel may capture key points and resources as they come up.",
      "items": [
        "Transcript: a written record of what was said.",
        "Summary: a concise overview of the session.",
        "Decisions: key decisions made during the meeting.",
        "Action items: tasks and next steps from the discussion.",
        "Shared resources: files and links attached to the session."
      ]
    },
    {
      "title": "Tips for better results",
      "body": "Review AI outputs before sharing them. Summaries are helpful, but should be checked for accuracy.",
      "items": [
        "Use a good microphone and reduce background noise.",
        "Speak one at a time where possible.",
        "State decisions and tasks explicitly.",
        "Review attendance and engagement context alongside the recording after a session."
      ]
    },
    {
      "title": "Learning workspaces (LMS)",
      "body": "The learning workspace brings courses and live sessions together.",
      "items": [
        "Courses: organize learning into sessions, modules, and materials.",
        "Sessions: schedule or launch live classes directly from a course.",
        "Assignments: create, distribute, and track student work.",
        "Resources: attach readings, slides, and files to a course or session.",
        "Role-aware views: instructors, students, and administrators see the tools relevant to them."
      ]
    },
    {
      "title": "Teaching and learning",
      "body": "Teachers create a course and its first session, collaborate live, capture the session record, and assign follow-up work. Learners open the course, join its live session, revisit recordings and resources after class, and complete assignments and action items."
    },
    {
      "title": "Course Builder",
      "body": "The Course Builder (Studio) is where instructors design course content. Open Course Builder from the Product menu or workspace, create a course with a title and description, add sessions, assignments, and resources in order, set access by role, and publish when ready."
    },
    {
      "title": "Shared resources",
      "body": "Files and materials stay connected to the work they belong to. Meeting files are attached to a specific session. Course resources are attached to a course and available to enrolled learners."
    },
    {
      "title": "Roles and permissions",
      "body": "Melanam uses role-aware access, so each person sees only what they need."
    },
    {
      "title": "Security and privacy",
      "body": "Private rooms use invite links and workspace permissions. Administrators control workspace membership and access. Content visibility follows each person’s role.",
      "items": [
        "Share invite links only with intended participants.",
        "Tell attendees when a session is recorded or transcribed.",
        "Review recordings and AI outputs before distributing them widely."
      ]
    },
    {
      "title": "Troubleshooting and FAQs",
      "body": "Check device volume, microphone and camera permissions, network connectivity, and the invite link if you have trouble joining. Ensure captions are enabled and audio is clear. Session processing can take a few minutes. Visit the Help Center for troubleshooting and frequently asked questions."
    },
    {
      "title": "Support",
      "body": "Contact gmnnetwork@gmail.com for support. Melanam is a product of Global Development Networks Ltd."
    }
  ]
}} />;
}
