import { z } from 'zod';
import type { PricingConfig } from './pricing.js';
import { DEFAULT_DISPLAY_TIMEZONE, isValidIanaTimeZone } from '../utils/dates.js';

export type NodeEnv = 'development' | 'test' | 'production';
export type BotMode = 'polling' | 'webhook';
export type TelegramAdminId = string;
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

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
  host?: string;
  port: number;
  webhookDomain?: string;
  webhookPath?: string;
  webhookSecret?: string;
  webhookAutoSetup?: boolean;
  trustProxy?: boolean;
  healthCheckSupabase?: boolean;
  logLevel?: LogLevel;
  shutdownTimeoutSeconds?: number;
  pricing: PricingConfig;
  paymentOrderTtlMinutes?: number;
  schedulerEnabled?: boolean;
  schedulerIntervalSeconds?: number;
  schedulerBatchSize?: number;
  subscriptionRetentionDays?: number;
  deletionWarningHours?: number;
  schedulerDryRun?: boolean;
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
  host: string;
  port: number;
  hasWebhookDomain: boolean;
  webhookPath: string;
  hasWebhookSecret: boolean;
  webhookAutoSetup: boolean;
  trustProxy: boolean;
  healthCheckSupabase: boolean;
  logLevel: LogLevel;
  shutdownTimeoutSeconds: number;
  pricing: PricingConfig;
  paymentOrderTtlMinutes?: number;
  schedulerEnabled: boolean;
  schedulerIntervalSeconds: number;
  schedulerBatchSize: number;
  subscriptionRetentionDays: number;
  deletionWarningHours: number;
  schedulerDryRun: boolean;
}

const WEBHOOK_SECRET_MIN_LENGTH = 16;

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

const positiveIntegerFromEnv = (fallback: string, max = 100_000) =>
  z.preprocess(
    trimWithDefault(fallback),
    z.coerce.number().int().positive('must be a positive integer').max(max, `must be <= ${max}`),
  );

const booleanFromEnv = (fallback: string) =>
  z.preprocess((value) => {
    const raw = trimWithDefault(fallback)(value).toLowerCase();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return raw;
  }, z.boolean());

const positivePortFromEnv = z.preprocess(
  trimWithDefault('3000'),
  z.coerce.number().int().positive('must be a positive integer').max(65_535, 'must be <= 65535'),
);

const webhookPathFromEnv = z.preprocess(
  trimWithDefault('/telegram/webhook'),
  z
    .string()
    .refine((value) => value.startsWith('/'), 'must start with /')
    .refine((value) => !value.includes('?'), 'must not include query string'),
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
  HOST: z.preprocess(trimWithDefault('0.0.0.0'), z.string().min(1)),
  PORT: positivePortFromEnv,
  WEBHOOK_DOMAIN: optionalText,
  WEBHOOK_PATH: webhookPathFromEnv,
  WEBHOOK_SECRET: optionalText,
  WEBHOOK_AUTO_SETUP: booleanFromEnv('true'),
  TRUST_PROXY: booleanFromEnv('false'),
  HEALTH_CHECK_SUPABASE: booleanFromEnv('true'),
  LOG_LEVEL: z.preprocess(
    trimWithDefault('info'),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  ),
  SHUTDOWN_TIMEOUT_SECONDS: positiveIntegerFromEnv('15', 300),
  FIRST_PERIOD_STARS: positiveIntegerFromEnv('100'),
  RENEWAL_PERIOD_STARS: positiveIntegerFromEnv('150'),
  FIRST_PERIOD_DAYS: positiveIntegerFromEnv('30'),
  RENEWAL_PERIOD_DAYS: positiveIntegerFromEnv('30'),
  PAYMENT_ORDER_TTL_MINUTES: positiveIntegerFromEnv('15', 24 * 60),
  SCHEDULER_ENABLED: booleanFromEnv('true'),
  SCHEDULER_INTERVAL_SECONDS: positiveIntegerFromEnv('60', 86_400),
  SCHEDULER_BATCH_SIZE: positiveIntegerFromEnv('100', 10_000),
  SUBSCRIPTION_RETENTION_DAYS: positiveIntegerFromEnv('60', 3_650),
  DELETION_WARNING_HOURS: positiveIntegerFromEnv('24', 24 * 365),
  SCHEDULER_DRY_RUN: booleanFromEnv('false'),
});

const issueToEnvName = (issue: z.ZodIssue): string => issue.path.join('.') || issue.message;

export const parseEnv = (source: NodeJS.ProcessEnv): AppEnv => {
  const parsed = rawEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = [...new Set(parsed.error.issues.map(issueToEnvName))].join(', ');
    throw new Error(`Invalid configuration: ${details}`);
  }

  let adminTelegramIds: TelegramAdminId[];
  try {
    adminTelegramIds = parseAdminTelegramIds(parsed.data.ADMIN_TELEGRAM_IDS);
  } catch (error) {
    throw new Error('Invalid configuration: ADMIN_TELEGRAM_IDS', { cause: error });
  }

  const env: AppEnv = {
    nodeEnv: parsed.data.NODE_ENV,
    botMode: parsed.data.BOT_MODE,
    adminTelegramIds,
    displayTimezone: parsed.data.DISPLAY_TIMEZONE,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    webhookPath: parsed.data.WEBHOOK_PATH,
    webhookAutoSetup: parsed.data.WEBHOOK_AUTO_SETUP,
    trustProxy: parsed.data.TRUST_PROXY,
    healthCheckSupabase: parsed.data.HEALTH_CHECK_SUPABASE,
    logLevel: parsed.data.LOG_LEVEL,
    shutdownTimeoutSeconds: parsed.data.SHUTDOWN_TIMEOUT_SECONDS,
    pricing: {
      firstPeriodStars: parsed.data.FIRST_PERIOD_STARS,
      renewalPeriodStars: parsed.data.RENEWAL_PERIOD_STARS,
      firstPeriodDays: parsed.data.FIRST_PERIOD_DAYS,
      renewalPeriodDays: parsed.data.RENEWAL_PERIOD_DAYS,
    },
    paymentOrderTtlMinutes: parsed.data.PAYMENT_ORDER_TTL_MINUTES,
    schedulerEnabled: parsed.data.SCHEDULER_ENABLED,
    schedulerIntervalSeconds: parsed.data.SCHEDULER_INTERVAL_SECONDS,
    schedulerBatchSize: parsed.data.SCHEDULER_BATCH_SIZE,
    subscriptionRetentionDays: parsed.data.SUBSCRIPTION_RETENTION_DAYS,
    deletionWarningHours: parsed.data.DELETION_WARNING_HOURS,
    schedulerDryRun: parsed.data.SCHEDULER_DRY_RUN,
  };

  if (parsed.data.BOT_TOKEN) env.botToken = parsed.data.BOT_TOKEN;
  if (parsed.data.SUPABASE_URL) env.supabaseUrl = parsed.data.SUPABASE_URL;
  if (parsed.data.SUPABASE_SERVICE_ROLE_KEY) {
    env.supabaseServiceRoleKey = parsed.data.SUPABASE_SERVICE_ROLE_KEY;
  }
  if (parsed.data.APP_URL) env.appUrl = parsed.data.APP_URL;
  if (parsed.data.SUPPORT_USERNAME) env.supportUsername = parsed.data.SUPPORT_USERNAME;
  if (parsed.data.WEBHOOK_DOMAIN)
    env.webhookDomain = normalizeWebhookDomain(parsed.data.WEBHOOK_DOMAIN);
  if (parsed.data.WEBHOOK_SECRET) env.webhookSecret = parsed.data.WEBHOOK_SECRET;

  validateRequiredEnv(env);
  return env;
};

const normalizeWebhookDomain = (domain: string): string => domain.replace(/\/+$/, '');

const validateRequiredEnv = (env: AppEnv): void => {
  const missing: string[] = [];
  if (!env.botToken) missing.push('BOT_TOKEN');

  if (env.nodeEnv === 'production') {
    if (!env.supabaseUrl) missing.push('SUPABASE_URL');
    if (!env.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!env.appUrl) missing.push('APP_URL');
    if (env.adminTelegramIds.length === 0) missing.push('ADMIN_TELEGRAM_IDS');
    if (env.botMode === 'webhook') {
      if (!env.webhookDomain) missing.push('WEBHOOK_DOMAIN');
      if (!env.webhookSecret) missing.push('WEBHOOK_SECRET');
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  if (env.botMode === 'webhook') {
    validateWebhookConfig(env);
  }
};

const validateWebhookConfig = (env: AppEnv): void => {
  if (env.webhookDomain) {
    let url: URL;
    try {
      url = new URL(env.webhookDomain);
    } catch {
      throw new Error('Invalid configuration: WEBHOOK_DOMAIN');
    }
    if (url.protocol !== 'https:' && env.nodeEnv === 'production') {
      throw new Error('Invalid configuration: WEBHOOK_DOMAIN');
    }
    if (url.search || url.hash) throw new Error('Invalid configuration: WEBHOOK_DOMAIN');
  }
  if (env.webhookSecret !== undefined && env.webhookSecret.length < WEBHOOK_SECRET_MIN_LENGTH) {
    throw new Error('Invalid configuration: WEBHOOK_SECRET');
  }
};

export const buildWebhookUrl = (env: Pick<AppEnv, 'webhookDomain' | 'webhookPath'>): string => {
  if (!env.webhookDomain) throw new Error('Missing required configuration: WEBHOOK_DOMAIN');
  const domain = env.webhookDomain.replace(/\/+$/, '');
  const webhookPath = env.webhookPath ?? '/telegram/webhook';
  const path = webhookPath.startsWith('/') ? webhookPath : `/${webhookPath}`;
  return `${domain}${path}`;
};

export const maskWebhookUrl = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.origin}/***`;
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
  host: env.host ?? '0.0.0.0',
  port: env.port,
  hasWebhookDomain: Boolean(env.webhookDomain),
  webhookPath:
    (env.webhookPath ?? '/telegram/webhook') === '/telegram/webhook'
      ? (env.webhookPath ?? '/telegram/webhook')
      : '/***',
  hasWebhookSecret: Boolean(env.webhookSecret),
  webhookAutoSetup: env.webhookAutoSetup ?? true,
  trustProxy: env.trustProxy ?? false,
  healthCheckSupabase: env.healthCheckSupabase ?? true,
  logLevel: env.logLevel ?? 'info',
  shutdownTimeoutSeconds: env.shutdownTimeoutSeconds ?? 15,
  pricing: env.pricing,
  paymentOrderTtlMinutes: env.paymentOrderTtlMinutes ?? 15,
  schedulerEnabled: env.schedulerEnabled ?? true,
  schedulerIntervalSeconds: env.schedulerIntervalSeconds ?? 60,
  schedulerBatchSize: env.schedulerBatchSize ?? 100,
  subscriptionRetentionDays: env.subscriptionRetentionDays ?? 60,
  deletionWarningHours: env.deletionWarningHours ?? 24,
  schedulerDryRun: env.schedulerDryRun ?? false,
});
