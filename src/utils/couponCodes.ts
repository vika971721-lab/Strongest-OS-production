import { createHash, randomInt } from 'node:crypto';
import {
  COUPON_DURATIONS,
  type CouponDurationDays,
  type CouponNormalizeResult,
} from '../types/coupon.js';

const MAX_COUPON_CODE_LENGTH = 64;
const COUPON_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const isCouponDurationDays = (value: number): value is CouponDurationDays =>
  (COUPON_DURATIONS as readonly number[]).includes(value);

export const normalizeCouponCode = (raw: string): CouponNormalizeResult => {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (/\r|\n/.test(trimmed)) return { ok: false, reason: 'multiline' };
  if (trimmed.length > MAX_COUPON_CODE_LENGTH) return { ok: false, reason: 'too_long' };
  if (trimmed.startsWith('/')) return { ok: false, reason: 'command' };
  return { ok: true, code: trimmed.toUpperCase() };
};

export const safeCouponLogData = (code: string): { codeHash: string; codeLast4: string } => ({
  codeHash: createHash('sha256').update(code).digest('hex').slice(0, 16),
  codeLast4: code.slice(-4),
});

const durationPrefix = (durationDays: CouponDurationDays): string => {
  if (durationDays === 30) return '1M';
  if (durationDays === 60) return '2M';
  return '6M';
};

export const generateCouponCode = (durationDays: CouponDurationDays, randomLength = 8): string => {
  let suffix = '';
  for (let index = 0; index < randomLength; index += 1) {
    suffix += COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)];
  }
  return `STR-${durationPrefix(durationDays)}-${suffix}`;
};
