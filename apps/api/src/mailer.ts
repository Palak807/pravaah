/* SMTP mailer for the contact form. Credentials come from env (never the repo).
   For a GoDaddy/Titan mailbox: host smtpout.secureserver.net, port 465 (SSL),
   username = the full email address, password = the mailbox password. */
import nodemailer, { type Transporter } from 'nodemailer';
import { env, smtpConfigured } from './env.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

export async function sendContactEmail(msg: ContactMessage): Promise<void> {
  if (!smtpConfigured()) throw new Error('smtp_not_configured');
  const t = getTransporter();
  const safe = (s: string) => s.replace(/[<>]/g, '');
  await t.sendMail({
    from: `"Pravaah contact form" <${env.smtp.user}>`, // must be the authenticated mailbox
    to: env.smtp.to,
    replyTo: `${safe(msg.name)} <${msg.email}>`,
    subject: `Contact form: ${safe(msg.name)}`,
    text: `From: ${msg.name} <${msg.email}>\n\n${msg.message}`,
  });
}
