import pino from 'pino';

export interface SafeError {
  code: string;
  message: string;
}

export const REDACTION_PATHS = [
  'token',
  'botToken',
  'BOT_TOKEN',
  'serviceRole',
  'SUPABASE_SERVICE_ROLE_KEY',
  'webhookSecret',
  'WEBHOOK_SECRET',
  'password',
  'newPassword',
  'authorization',
  'x-telegram-bot-api-secret-token',
  '*.token',
  '*.botToken',
  '*.BOT_TOKEN',
  '*.serviceRole',
  '*.SUPABASE_SERVICE_ROLE_KEY',
  '*.webhookSecret',
  '*.WEBHOOK_SECRET',
  '*.password',
  '*.newPassword',
  '*.authorization',
  '*.x-telegram-bot-api-secret-token',
  'headers.authorization',
  'headers.x-telegram-bot-api-secret-token',
  'req.headers.authorization',
  'req.headers.x-telegram-bot-api-secret-token',
];

export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || 'info',
  redact: {
    paths: REDACTION_PATHS,
    censor: '[REDACTED]',
  },
});

export const normalizeError = (error: unknown): SafeError => {
  if (error instanceof Error) {
    return { code: error.name || 'Error', message: error.message };
  }
  return { code: 'UnknownError', message: 'Unknown error' };
};

export const safeErrorCode = (error: unknown): string => normalizeError(error).code;
