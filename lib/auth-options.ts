import type { NextAuthOptions } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import nodemailer from 'nodemailer';
import clientPromise from './mongodb-adapter';
import dbConnect from './db';
import User from '../models/User';
import Organization from '../models/Organization';
import { canAddOrganizationSeat } from './workspace-usage';

const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@localhost';

const smtpHost = process.env.EMAIL_SERVER_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.EMAIL_SERVER_PORT || process.env.EMAIL_PORT || 587);
const smtpSecure = (process.env.EMAIL_SERVER_SECURE || process.env.EMAIL_SECURE) === 'true';
const smtpUser = process.env.EMAIL_USER || process.env.EMAIL_SERVER_USER;
const smtpPass = process.env.EMAIL_PASS || process.env.EMAIL_SERVER_PASSWORD;
const emailTransportMode =
  process.env.EMAIL_TRANSPORT ||
  (process.env.EMAIL_USER && process.env.EMAIL_PASS ? 'smtp' : 'console');
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const buildSmtpTransport = () => {
  if (!smtpUser || !smtpPass) {
    throw new Error('Missing SMTP credentials. Set EMAIL_USER and EMAIL_PASS, or use EMAIL_TRANSPORT=console for local testing.');
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
};

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    EmailProvider({
      server: {
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      },
      from: emailFrom,
      async sendVerificationRequest({ identifier, url, provider }) {
        const appName = 'Melanam';
        const safeUrl = escapeHtml(url);
        const safeIdentifier = escapeHtml(identifier);

        if (emailTransportMode !== 'smtp') {
          console.info('[NextAuth][email] Magic link for %s: %s', identifier, url);
          return;
        }

        const transport = buildSmtpTransport();
        const message = {
          to: identifier,
          from: provider.from,
          subject: `Your secure ${appName} sign-in link`,
          text: [
            `Sign in to ${appName}`,
            '',
            `Use this secure link to continue as ${identifier}:`,
            url,
            '',
            'This link can only be used once. If you did not request it, you can ignore this email.',
          ].join('\n'),
          html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Your secure ${appName} sign-in link</title>
  </head>
  <body style="margin:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;overflow:hidden;border-radius:22px;background:#ffffff;border:1px solid #e2e8f0;box-shadow:0 18px 50px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:28px 28px 18px;">
                <div style="display:inline-block;height:40px;width:40px;border-radius:14px;background:#0f172a;color:#ffffff;text-align:center;line-height:40px;font-weight:700;font-size:20px;">M</div>
                <h1 style="margin:22px 0 8px;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:0;color:#0f172a;">Sign in to ${appName}</h1>
                <p style="margin:0;color:#475569;font-size:15px;line-height:1.7;">Use this secure link to continue to your Melanam workspace.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 28px 28px;">
                <a href="${safeUrl}" style="display:inline-block;border-radius:14px;background:#0891b2;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 22px;box-shadow:0 10px 24px rgba(8,145,178,0.22);">Sign in securely</a>
                <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.7;">This link was requested for <strong style="color:#334155;">${safeIdentifier}</strong>. It can only be used once.</p>
                <p style="margin:16px 0 0;color:#64748b;font-size:13px;line-height:1.7;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:8px 0 0;word-break:break-all;font-size:12px;line-height:1.6;"><a href="${safeUrl}" style="color:#0891b2;text-decoration:underline;">${safeUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e2e8f0;background:#f8fafc;padding:18px 28px;">
                <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">If you did not request this email, you can safely ignore it.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
        };

        await transport.sendMail(message);
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: 24 * 60 * 60,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      await dbConnect();
      
      const dbUser = await User.findOne({ email: user.email.toLowerCase() });
      if (!dbUser) {
        return false;
      }

      if (dbUser && dbUser.status === 'disabled') {
        return false; // Block user login if disabled
      }
      return true;
    },
    async jwt({ token, user }) {
      await dbConnect();
      
      const email = token.email || user?.email;
      if (email) {
        let dbUser = await User.findOne({ email: email.toLowerCase() });
        
        if (dbUser) {
          let updated = false;
          
          // Existing non-admin accounts use the same conferencing account type.
          if (dbUser.role !== 'admin' && dbUser.role !== 'user') {
            dbUser.role = 'user';
            updated = true;
          }

          // Domain auto-joining
          if (!dbUser.organizationId) {
            const domain = dbUser.email.split('@')[1];
            const ignoreDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'example.com'];
            if (domain && !ignoreDomains.includes(domain.toLowerCase())) {
            const org = await Organization.findOne({ domain: domain.toLowerCase() });
            if (org) {
              const seatCheck = await canAddOrganizationSeat(org._id.toString());
              if (seatCheck.ok) {
                dbUser.organizationId = org._id.toString();
                updated = true;
              }
            }
            }
          }
          
          if (updated) {
            await dbUser.save();
          }
          
          token.id = dbUser._id.toString();
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId ? dbUser.organizationId.toString() : null;
          token.status = dbUser.status;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role === 'admin' ? 'admin' : 'user';
        (session.user as any).organizationId = token.organizationId || null;
        (session.user as any).status = token.status || 'active';
      }
      return session;
    },
  },
  // Enable debug logging in development to surface SMTP/host errors
  debug: process.env.NODE_ENV !== 'production',
  pages: {
    signIn: '/sign-in',
  },
};
