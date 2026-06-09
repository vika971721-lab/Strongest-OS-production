import { z } from 'zod';
import type { PricingConfig } from './pricing.js';
import { DEFAULT_DISPLAY_TIMEZONE, isValidIanaTimeZone } from '../utils/dates.js';

export type NodeEnv = 'development' | 'test' | 'production';
export type BotMode = 'polling' | 'webhook';
export type TelegramAdminId = string;

export interface AppEnv {
  nodeEnv: NodeEnv;
  botMode: BotMode;
  botToken?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  appUrl?: string;
  adminTelegramIds: TelegramAdminId[];
  supportUsername?: string;
  displayTimezone: string;
  webhookDomain?: string;
  webhookSecret?: string;
  port: number;
  pricing: PricingConfig;
}

export interface SafeEnvLogData {
  nodeEnv: NodeEnv;
  botMode: BotMode;
  hasBotToken: boolean;
  hasSupabaseUrl: boolean;
  hasSupabaseServiceRoleKey: boolean;
  hasAppUrl: boolean;
  adminTelegramIdsCount: number;
  hasSupportUsername: boolean;
  displayTimezone: string;
  hasWebhookDomain: boolean;
  hasWebhookSecret: boolean;
  port: number;
  pricing: PricingConfig;
}

const trimOptional = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const trimWithDefault =
  (fallback: string) =>
  (value: unknown): string => {
    const trimmed = trimOptional(value);
    return trimmed ?? fallback;
  };

const optionalUrl = z.preprocess(trimOptional, z.string().url().optional());
const optionalText = z.preprocess(trimOptional, z.string().optional());

const positiveIntegerFromEnv = (fallback: string) =>
  z.preprocess(
    trimWithDefault(fallback),
    z.coerce.number().int().positive('must be a positive integer'),
  );

const positivePortFromEnv = z.preprocess(
  trimWithDefault('3000'),
  z.coerce.number().int().positive('PORT must be a positive integer'),
);

export const parseAdminTelegramIds = (raw: string | undefined): TelegramAdminId[] => {
  const normalized = trimOptional(raw);
  if (!normalized) return [];

  return normalized.split(',').map((part) => {
    const id = part.trim();
    if (!/^-?\d+$/.test(id)) {
      throw new Error(`Invalid ADMIN_TELEGRAM_IDS entry: ${id || '<empty>'}`);
    }
    return id;
  });
};

const rawEnvSchema = z.object({
  NODE_ENV: z.preprocess(
    trimWithDefault('development'),
    z.enum(['development', 'test', 'production']),
  ),
  BOT_MODE: z.preprocess(trimWithDefault('polling'), z.enum(['polling', 'webhook'])),
  BOT_TOKEN: optionalText,
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  APP_URL: optionalUrl,
  ADMIN_TELEGRAM_IDS: optionalText,
  SUPPORT_USERNAME: optionalText,
  DISPLAY_TIMEZONE: z.preprocess(
    trimWithDefault(DEFAULT_DISPLAY_TIMEZONE),
    z.string().refine(isValidIanaTimeZone, 'must be a valid IANA timezone'),
  ),
  WEBHOOK_DOMAIN: optionalText,
  WEBHOOK_SECRET: optionalText,
  PORT: positivePortFromEnv,
  FIRST_PERIOD_STARS: positiveIntegerFromEnv('100'),
  RENEWAL_PERIOD_STARS: positiveIntegerFromEnv('150'),
  FIRST_PERIOD_DAYS: positiveIntegerFromEnv('30'),
  RENEWAL_PERIOD_DAYS: positiveIntegerFromEnv('30'),
});

export const parseEnv = (source: NodeJS.ProcessEnv): AppEnv => {
  const parsed = rawEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => issue.path.join('.') || issue.message)
      .join(', ');
    throw new Error(`Invalid configuration: ${details}`);
  }

  let adminTelegramIds: TelegramAdminId[];
  try {
    adminTelegramIds = parseAdminTelegramIds(parsed.data.ADMIN_TELEGRAM_IDS);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid ADMIN_TELEGRAM_IDS';
    throw new Error(`Invalid configuration: ${message}`, { cause: error });
  }

  const env: AppEnv = {
    nodeEnv: parsed.data.NODE_ENV,
    botMode: parsed.data.BOT_MODE,
    adminTelegramIds,
    port: parsed.data.PORT,
    displayTimezone: parsed.data.DISPLAY_TIMEZONE,
    pricing: {
      firstPeriodStars: parsed.data.FIRST_PERIOD_STARS,
      renewalPeriodStars: parsed.data.RENEWAL_PERIOD_STARS,
      firstPeriodDays: parsed.data.FIRST_PERIOD_DAYS,
      renewalPeriodDays: parsed.data.RENEWAL_PERIOD_DAYS,
    },
  };

  if (parsed.data.BOT_TOKEN) env.botToken = parsed.data.BOT_TOKEN;
  if (parsed.data.SUPABASE_URL) env.supabaseUrl = parsed.data.SUPABASE_URL;
  if (parsed.data.SUPABASE_SERVICE_ROLE_KEY) {
    env.supabaseServiceRoleKey = parsed.data.SUPABASE_SERVICE_ROLE_KEY;
  }
  if (parsed.data.APP_URL) env.appUrl = parsed.data.APP_URL;
  if (parsed.data.SUPPORT_USERNAME) env.supportUsername = parsed.data.SUPPORT_USERNAME;
  if (parsed.data.WEBHOOK_DOMAIN) env.webhookDomain = parsed.data.WEBHOOK_DOMAIN;
  if (parsed.data.WEBHOOK_SECRET) env.webhookSecret = parsed.data.WEBHOOK_SECRET;

  validateRequiredEnv(env);
  return env;
};

const validateRequiredEnv = (env: AppEnv): void => {
  const missing: string[] = [];
  if (!env.botToken) missing.push('BOT_TOKEN');

  if (env.nodeEnv === 'production') {
    if (!env.supabaseUrl) missing.push('SUPABASE_URL');
    if (!env.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!env.appUrl) missing.push('APP_URL');
    if (env.botMode === 'webhook') {
      if (!env.webhookDomain) missing.push('WEBHOOK_DOMAIN');
      if (!env.webhookSecret) missing.push('WEBHOOK_SECRET');
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
};

export const toSafeEnvLogData = (env: AppEnv): SafeEnvLogData => ({
  nodeEnv: env.nodeEnv,
  botMode: env.botMode,
  hasBotToken: Boolean(env.botToken),
  hasSupabaseUrl: Boolean(env.supabaseUrl),
  hasSupabaseServiceRoleKey: Boolean(env.supabaseServiceRoleKey),
  hasAppUrl: Boolean(env.appUrl),
  adminTelegramIdsCount: env.adminTelegramIds.length,
  hasSupportUsername: Boolean(env.supportUsername),
  displayTimezone: env.displayTimezone,
  hasWebhookDomain: Boolean(env.webhookDomain),
  hasWebhookSecret: Boolean(env.webhookSecret),
  port: env.port,
  pricing: env.pricing,
});
