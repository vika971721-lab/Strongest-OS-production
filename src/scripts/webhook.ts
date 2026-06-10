import 'dotenv/config';
import { TELEGRAM_ALLOWED_UPDATES } from '../app.js';
import { buildWebhookUrl, maskWebhookUrl, parseEnv } from '../config/env.js';

const action = process.argv[2];
const env = parseEnv(process.env);

if (!env.botToken) throw new Error('Missing required configuration: BOT_TOKEN');

const telegramApi = async (method: string, body?: Record<string, unknown>): Promise<unknown> => {
  const response = await fetch(`https://api.telegram.org/bot${env.botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json()) as { ok?: boolean; result?: unknown; description?: string };
  if (!response.ok || !data.ok) throw new Error(data.description ?? `Telegram ${method} failed`);
  return data.result;
};

if (action === 'set') {
  const result = await telegramApi('setWebhook', {
    url: buildWebhookUrl(env),
    secret_token: env.webhookSecret,
    allowed_updates: TELEGRAM_ALLOWED_UPDATES,
  });
  process.stdout.write(
    JSON.stringify({ ok: true, action, webhookUrl: maskWebhookUrl(buildWebhookUrl(env)), result }) +
      '\n',
  );
} else if (action === 'delete') {
  const result = await telegramApi('deleteWebhook', { drop_pending_updates: false });
  process.stdout.write(JSON.stringify({ ok: true, action, result }) + '\n');
} else if (action === 'info') {
  const info = (await telegramApi('getWebhookInfo')) as { url?: string; [key: string]: unknown };
  process.stdout.write(
    JSON.stringify({ ...info, url: info.url ? maskWebhookUrl(info.url) : '' }) + '\n',
  );
} else {
  throw new Error('Usage: webhook.ts <set|delete|info>');
}
