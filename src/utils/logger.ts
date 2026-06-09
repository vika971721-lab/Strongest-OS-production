import pino from 'pino';

export interface SafeError {
  code: string;
  message: string;
}

export const logger = pino({
  level: process.env.LOG_LEVEL?.trim() || 'info',
  redact: {
    paths: ['BOT_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', '*.token', '*.password', '*.secret'],
    remove: true,
  },
});

export const normalizeError = (error: unknown): SafeError => {
  if (error instanceof Error) {
    return { code: error.name || 'Error', message: error.message };
  }
  return { code: 'UnknownError', message: 'Unknown error' };
};
