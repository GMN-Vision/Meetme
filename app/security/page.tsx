import { InfoPage } from '../info-pages';

export default function SecurityPage() {
  return <InfoPage {...{
  "eyebrow": "Security and privacy",
  "title": "Private by design.",
  "description": "Rooms are private, workspaces are controlled, and access is role-aware.",
  "ctaHref": "mailto:gmnnetwork@gmail.com",
  "ctaLabel": "Contact support",
  "sections": [
    {
      "title": "Private rooms",
      "body": "Access is by invite link and workspace permissions."
    },
    {
      "title": "Controlled workspaces",
      "body": "Administrators decide who belongs and what they can access."
    },
    {
      "title": "Role-aware access",
      "body": "Content visibility follows each person’s role."
    },
    {
      "title": "Good practice",
      "body": "Keep session access and shared content intentional.",
      "items": [
        "Share invite links only with intended participants.",
        "Tell attendees when a session is recorded or transcribed.",
        "Review recordings and AI outputs before distributing them widely."
      ]
    }
  ]
}} />;
}
