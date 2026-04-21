const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST ? process.env.SMTP_HOST.trim() : '';
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : '';
const smtpPassword = process.env.SMTP_PASSWORD || '';
const smtpFromEmail = process.env.SMTP_FROM_EMAIL
  ? process.env.SMTP_FROM_EMAIL.trim()
  : smtpUser;
const smtpFromName = process.env.SMTP_FROM_NAME
  ? process.env.SMTP_FROM_NAME.trim()
  : 'Лизинг CRM';

let transporter = null;

const getMissingSmtpFields = () => {
  const missing = [];

  if (!smtpHost) {
    missing.push('SMTP_HOST');
  }

  if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
    missing.push('SMTP_PORT');
  }

  if (!smtpUser) {
    missing.push('SMTP_USER');
  }

  if (!smtpPassword) {
    missing.push('SMTP_PASSWORD');
  }

  if (!smtpFromEmail) {
    missing.push('SMTP_FROM_EMAIL');
  }

  return missing;
};

const getTransporter = () => {
  const missingFields = getMissingSmtpFields();

  if (missingFields.length > 0) {
    throw new Error(`SMTP не настроен. Отсутствуют поля: ${missingFields.join(', ')}`);
  }

  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  return transporter;
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatFromHeader = () => {
  const safeName = smtpFromName.replaceAll('"', '\\"');
  return `"${safeName}" <${smtpFromEmail}>`;
};

const buildMailContent = ({ setupLink, expiresAt, isInvite }) => {
  const expiresAtIso = new Date(expiresAt).toISOString();
  const actionTitle = isInvite ? 'Приглашение в аккаунт' : 'Смена пароля';
  const safeLink = escapeHtml(setupLink);

  return {
    subject: isInvite
      ? 'Лизинг CRM: установите пароль для аккаунта'
      : 'Лизинг CRM: ссылка для смены пароля',
    text: [
      `${actionTitle} в Лизинг CRM.`,
      '',
      `Откройте ссылку: ${setupLink}`,
      `Ссылка действует до: ${expiresAtIso}`,
      '',
      'Если вы не запрашивали это письмо, просто проигнорируйте его.',
    ].join('\n'),
    html: `
      <p><strong>${escapeHtml(actionTitle)}</strong> в Лизинг CRM.</p>
      <p><a href="${safeLink}">Открыть страницу установки пароля</a></p>
      <p>Ссылка действует до: <strong>${escapeHtml(expiresAtIso)}</strong></p>
      <p>Если вы не запрашивали это письмо, просто проигнорируйте его.</p>
    `,
  };
};

const sendPasswordSetupEmail = async ({ email, setupLink, expiresAt, isInvite }) => {
  const transport = getTransporter();
  const content = buildMailContent({ setupLink, expiresAt, isInvite });

  await transport.sendMail({
    from: formatFromHeader(),
    to: email,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
};

module.exports = {
  sendPasswordSetupEmail,
};
