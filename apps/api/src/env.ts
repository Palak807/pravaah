export const env = {
  port: Number(process.env.API_PORT ?? 3000),
  host: process.env.API_HOST ?? '0.0.0.0',
  hospitalName: process.env.HOSPITAL_NAME ?? 'Sunrise Nursing Home',
  assistantProvider: (process.env.ASSISTANT_PROVIDER ?? 'scripted') as 'scripted' | 'model',
  databaseUrl: process.env.DATABASE_URL ?? '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    // Where contact-form messages are delivered; defaults to the mailbox itself.
    to: process.env.CONTACT_TO ?? process.env.SMTP_USER ?? '',
  },
};

export const smtpConfigured = () => !!(env.smtp.host && env.smtp.user && env.smtp.pass && env.smtp.to);
