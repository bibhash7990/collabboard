import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Sending strategy (in priority order):
 *  1. Resend HTTP API  — set RESEND_API_KEY. Works on Render free tier because it
 *     uses HTTPS (port 443), not SMTP ports that are often firewalled.
 *  2. SMTP via Nodemailer — set SMTP_HOST (+ PORT/USER/PASS). Works when the host
 *     allows outbound SMTP (465/587). Does NOT work on Render's free tier.
 *  3. Dev logger — no env vars set. Prints the email + link to the server console.
 */

/* ── 1. Resend HTTP client ────────────────────────────────────────────── */
let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

/* ── 2. SMTP transporter (legacy) ─────────────────────────────────────── */
let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    const port = env.SMTP_PORT ?? 587;
    // Port 465 = implicit TLS (secure:true). Port 587/25 = STARTTLS (secure:false).
    const secure = port === 465;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  /* ── Strategy 1: Resend HTTP API ─────────────────────────────────────── */
  const resend = getResendClient();
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: env.EMAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      if (error) {
        // Resend returned an API-level error (e.g. unverified domain, invalid key)
        logger.error({ error, to: mail.to, subject: mail.subject, text: mail.text },
          '📧 [EMAIL FAILED via Resend – falling back to log]');
      } else {
        logger.info({ to: mail.to, subject: mail.subject }, '📧 [EMAIL SENT via Resend]');
      }
    } catch (err) {
      logger.error({ err, to: mail.to, subject: mail.subject, text: mail.text },
        '📧 [EMAIL FAILED via Resend – falling back to log]');
    }
    return;
  }

  /* ── Strategy 2: SMTP (nodemailer) ──────────────────────────────────── */
  const tx = getTransporter();
  if (tx) {
    try {
      await tx.sendMail({ from: env.EMAIL_FROM, ...mail });
      logger.info({ to: mail.to, subject: mail.subject }, '📧 [EMAIL SENT via SMTP]');
    } catch (err) {
      // SMTP failure (blocked port, wrong credentials, etc.)
      // Never crash the registration request — just log the link.
      logger.error({ err, to: mail.to, subject: mail.subject, text: mail.text },
        '📧 [EMAIL FAILED via SMTP – falling back to log]');
    }
    return;
  }

  /* ── Strategy 3: Dev logger (no transport configured) ───────────────── */
  logger.info({ to: mail.to, subject: mail.subject, text: mail.text }, '📧 [DEV EMAIL]');
}

export function verificationEmail(name: string, link: string): Mail {
  return {
    to: '',
    subject: 'Verify your CollabBoard email',
    text: `Hi ${name}, verify your email: ${link}`,
    html: `<p>Hi ${name},</p><p>Confirm your email to start collaborating:</p><p><a href="${link}">Verify email</a></p>`,
  };
}

export function invitationEmail(inviter: string, resource: string, link: string): Mail {
  return {
    to: '',
    subject: `${inviter} invited you to collaborate on CollabBoard`,
    text: `${inviter} invited you to ${resource}. Accept: ${link}`,
    html: `<p>${inviter} invited you to <b>${resource}</b>.</p><p><a href="${link}">Accept invitation</a></p>`,
  };
}
