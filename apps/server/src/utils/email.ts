import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Dev-friendly mailer. With SMTP_* set it sends for real; otherwise it logs the
 * message (and the verification/invite link) to the server console — perfect for
 * local development and CI without a mail server.
 */
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    const port = env.SMTP_PORT ?? 587;
    // Port 465 = implicit TLS (secure:true). Port 587/25 = STARTTLS (secure:false).
    // Resend uses port 465; Gmail uses port 587. Auto-detect so both work.
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
  const tx = getTransporter();
  if (!tx) {
    logger.info({ to: mail.to, subject: mail.subject, text: mail.text }, '📧 [DEV EMAIL]');
    return;
  }
  try {
    await tx.sendMail({ from: env.EMAIL_FROM, ...mail });
    logger.info({ to: mail.to, subject: mail.subject }, '📧 [EMAIL SENT]');
  } catch (err) {
    // SMTP failure (e.g. Gmail blocking the server IP, wrong credentials, etc.)
    // Log the real error and the plain-text link so the verification URL is always
    // visible in the server logs, but do NOT re-throw — a mail delivery failure
    // must never crash the registration/invite request for the user.
    logger.error({ err, to: mail.to, subject: mail.subject, text: mail.text }, '📧 [EMAIL FAILED – falling back to log]');
  }
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
