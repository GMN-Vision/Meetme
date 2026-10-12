import { InfoPage } from '../info-pages';

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="About Melanam"
      title="Where Conversations Become Knowledge"
      description="Melanam is more than a video-conferencing platform. It is a smarter space to meet, teach, collaborate, share ideas and turn conversations into lasting knowledge."
      ctaHref="mailto:gdnvision360@gmail.com"
      ctaLabel="Get in touch"
      sections={[
        {
          title: 'More than a meeting',
          body: 'Connecting people is only the beginning. The real value lies in what they learn, create, share and accomplish together. Melanam brings people together through browser-based video meetings and the tools that make each interaction more meaningful—from online classes and professional meetings to workshops, presentations and collaborative discussions.'
        },
        {
          title: 'One platform. Many possibilities.',
          body: 'Melanam brings the meeting and the work around it into one connected environment.',
          items: [
            'Connect with colleagues, students, clients and communities through convenient online meetings.',
            'Teach and learn with interactive tools, shared resources and recorded sessions.',
            'Collaborate with shared files, digital whiteboards, screen sharing and interactive features.',
            'Capture important discussions with recordings, captions and AI-generated meeting summaries.',
            'Keep meeting records and follow-up work close, so ideas can continue after the conversation.'
          ]
        },
        {
          title: 'Designed for people, education and progress',
          body: 'Whether you are an educator leading a virtual class, a professional hosting a meeting, an institution delivering online programmes or a team working across distances, Melanam offers a versatile environment for meaningful digital interaction. Our aim is to make online communication simpler, more productive and more purposeful.'
        },
        {
          title: 'Our vision',
          body: 'We envision a digital world where technology does more than connect people: it helps them learn from one another, preserve shared knowledge and turn understanding into meaningful action. Melanam brings communication, collaboration, learning and AI together in a connected experience.'
        },
        {
          title: 'Make every conversation count',
          body: 'Every meeting holds an opportunity. Every lesson can inspire discovery. Every discussion can lead to a new idea. With Melanam, connect with people, collaborate on ideas and create something that lasts. Melanam — Connect. Converse. Collaborate. Create.'
        },
        {
          title: 'The company',
          body: 'Melanam is a product of Global Development Networks Ltd.'
        },
        {
          title: 'Contact information',
          body: 'For enquiries, contact Global Development Networks Ltd.',
          items: [
            'Mobile: +91 70189 36597',
            'Email: gdnvision360@gmail.com',
            'Domain: ultimoversio.com',
            'Domain: citizenmedianetworks.com',
            'Melanam: www.melanam.com',
            'Help Center: www.melanam.com/help-center'
          ]
        }
      ]}
    />
  );
}
