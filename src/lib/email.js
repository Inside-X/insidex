import { logger } from '../utils/logger.js';

function parseBoolean(value) {
  if (value == null) return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export async function sendConfirmationEmail({ userId, email }) {
  if (!parseBoolean(process.env.AUTH_EMAIL_CONFIRMATION_ENABLED)) {
    return { sent: false, reason: 'disabled' };
  }

  logger.info('auth_confirmation_email_queued', {
    userId,
    email,
  });

  return { sent: true };
}

export default {
  sendConfirmationEmail,
};