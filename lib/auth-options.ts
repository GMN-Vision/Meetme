import type { NextAuthOptions } from 'next-auth';
import EmailProvider from 'next-auth/providers/email';
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import nodemailer from 'nodemailer';
import clientPromise from './mongodb-adapter';
import dbConnect from './db';
import User from '../models/User';
import Organization from '../models/Organization';
import { canAddOrganizationSeat } from './workspace-usage';

const emailFromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@localhost';
const emailFrom = emailFromAddress.includes('<') ? emailFromAddress : `Melanam <${emailFromAddress}>`;

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
  <body style="margin:0;padding:0;background:#09090b;font-family:Manrope,Segoe UI,Arial,sans-serif;color:#fafafa;">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Your workspace is one click away. Sign in securely to Melanam.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#09090b" style="background:#09090b;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#18181b" style="max-width:560px;border-radius:24px;background:#18181b;border:1px solid #27272a;">
            <tr>
              <td style="padding:28px;border-bottom:1px solid #27272a;">
                <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                  <td width="36" height="36" align="center" bgcolor="#fafafa" style="border-radius:10px;background:#fafafa;vertical-align:middle;">
                    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                      <td valign="middle" style="padding:0 2px;"><div style="width:3px;height:8px;background:#09090b;border-radius:3px;"></div></td>
                      <td valign="middle" style="padding:0 2px;"><div style="width:3px;height:12px;background:#09090b;border-radius:3px;"></div></td>
                      <td valign="middle" style="padding:0 2px;"><div style="width:3px;height:16px;background:#09090b;border-radius:3px;"></div></td>
                    </tr></table>
                  </td>
                  <td style="padding-left:12px;font-size:24px;font-weight:700;letter-spacing:-1px;color:#fafafa;">melanam</td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">
                <p style="margin:0 0 14px;color:#a1a1aa;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Your workspace awaits</p>
                <h1 style="margin:0 0 14px;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:-1px;color:#fafafa;">Great conversations<br />start here.</h1>
                <p style="margin:0 0 28px;color:#a1a1aa;font-size:15px;line-height:1.8;">One secure click to your meetings, your ideas, and the people who bring them to life.</p>
                <table role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center" bgcolor="#fafafa" style="border-radius:28px;background:#fafafa;mso-padding-alt:15px 28px;">
                  <a href="${safeUrl}" style="display:inline-block;border:1px solid #fafafa;border-radius:28px;background:#fafafa;color:#09090b;text-decoration:none;font-size:15px;line-height:20px;font-weight:700;padding:15px 28px;">Sign in to ${appName} &rarr;</a>
                </td></tr></table>
                <p style="margin:28px 0 0;color:#a1a1aa;font-size:13px;line-height:1.8;">Requested for <strong style="color:#e4e4e7;word-break:break-all;">${safeIdentifier}</strong><br />This secure sign-in link can only be used once.</p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #27272a;padding:24px 28px;">
                <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.8;">Button not working? Copy and paste this link into your browser:</p>
                <p style="margin:8px 0 20px;word-break:break-all;overflow-wrap:anywhere;font-size:12px;line-height:1.8;"><a href="${safeUrl}" style="color:#d4d4d8;text-decoration:underline;">${safeUrl}</a></p>
                <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.8;">If you did not request this email, you can safely ignore it.</p>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0;color:#a1a1aa;font-size:12px;line-height:1.8;">Melanam &middot; A space to meet. A place to connect.</p>
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
