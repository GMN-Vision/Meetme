const jitsiDomain = (process.env.NEXT_PUBLIC_JITSI_DOMAIN || 'meet.melanam.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep verification builds separate from a running development server.
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  reactStrictMode: true,
  swcMinify: true,
  async redirects() {
    return [
      { source: '/favicon.ico', destination: '/icon.svg', permanent: false },
      { source: '/lms/:role/recordings', destination: '/meetings/recordings', permanent: true },
      { source: '/lms/:role/notes', destination: '/meetings/notes', permanent: true },
      { source: '/lms/admin', destination: '/admin', permanent: true },
      { source: '/lms/:path*', destination: '/meetings', permanent: true },
      { source: '/studio', destination: '/meetings', permanent: true },
      { source: '/enterprise', destination: '/meetings', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            // Jitsi runs in a cross-origin iframe. Delegate media access to it
            // explicitly so browsers that enforce Permissions Policy do not
            // reject its camera/microphone request before the user can respond.
            key: 'Permissions-Policy',
            value: `camera=(self "https://${jitsiDomain}"), microphone=(self "https://${jitsiDomain}"), display-capture=(self "https://${jitsiDomain}"), picture-in-picture=(self "https://${jitsiDomain}")`,
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
