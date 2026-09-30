const jitsiDomain = (process.env.NEXT_PUBLIC_JITSI_DOMAIN || 'meet.melanam.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
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
            value: `camera=(self "https://${jitsiDomain}"), microphone=(self "https://${jitsiDomain}"), display-capture=(self "https://${jitsiDomain}")`,
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
