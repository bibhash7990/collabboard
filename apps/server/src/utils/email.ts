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
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
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
  await tx.sendMail({ from: env.EMAIL_FROM, ...mail });
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
