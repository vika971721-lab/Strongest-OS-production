import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../types/database.js';
import {
  type AccessCoupon,
  type CouponDurationDays,
  type CouponRedeemInput,
  type CouponRedemptionResult,
  type CouponStatus,
  type CreateCouponInput,
} from '../types/coupon.js';
import { normalizeCouponCode } from '../utils/couponCodes.js';

interface CouponRow {
  id: string;
  code: string;
  duration_days: number;
  status: CouponStatus;
  source: string;
  source_case_id?: string | null;
  source_opening_id?: string | null;
  created_by_user_id?: string | null;
  created_by_telegram_id?: string | null;
  redeemed_by_user_id?: string | null;
  redeemed_by_telegram_id?: string | null;
  issued_at?: string | null;
  redeemed_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

type QueryResult<T> = { data: T | null; error: { message: string } | null };
type SupabaseLike = SupabaseClient<Database> & {
  from(table: 'access_coupons'): {
    select(columns?: string): unknown;
    insert(values: unknown): {
      select(columns?: string): { single(): Promise<QueryResult<CouponRow>> };
    };
    update(values: unknown): unknown;
  };
  rpc(name: 'redeem_access_coupon', args: Record<string, unknown>): Promise<QueryResult<Json>>;
};

const toDate = (value?: string | null): Date | null | undefined => {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
};

const mapCoupon = (row: CouponRow): AccessCoupon => ({
  id: row.id,
  code: row.code,
  durationDays: row.duration_days,
  status: row.status,
  source: row.source,
  sourceCaseId: row.source_case_id,
  sourceOpeningId: row.source_opening_id,
  createdByUserId: row.created_by_user_id,
  createdByTelegramId: row.created_by_telegram_id,
  redeemedByUserId: row.redeemed_by_user_id,
  redeemedByTelegramId: row.redeemed_by_telegram_id,
  issuedAt: toDate(row.issued_at),
  redeemedAt: toDate(row.redeemed_at),
  expiresAt: toDate(row.expires_at),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at),
});

const singleByCode = (client: SupabaseLike, code: string) =>
  (
    client.from('access_coupons').select('*') as {
      eq(column: string, value: string): { maybeSingle(): Promise<QueryResult<CouponRow>> };
    }
  )
    .eq('code', code)
    .maybeSingle();

const singleById = (client: SupabaseLike, id: string) =>
  (
    client.from('access_coupons').select('*') as {
      eq(column: string, value: string): { maybeSingle(): Promise<QueryResult<CouponRow>> };
    }
  )
    .eq('id', id)
    .maybeSingle();

const updateByCode = (client: SupabaseLike, code: string, values: Record<string, unknown>) =>
  (
    client.from('access_coupons').update(values) as {
      eq(
        column: string,
        value: string,
      ): { select(columns?: string): { single(): Promise<QueryResult<CouponRow>> } };
    }
  )
    .eq('code', code)
    .select('*')
    .single();

const asRedemptionResult = (data: Json | null): CouponRedemptionResult => {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return { status: 'temporary_error' };
  const status = typeof data.status === 'string' ? data.status : 'temporary_error';
  const result: CouponRedemptionResult = { status: status as CouponRedemptionResult['status'] };
  if (typeof data.coupon_id === 'string') result.couponId = data.coupon_id;
  if (typeof data.duration_days === 'number')
    result.durationDays = data.duration_days as CouponDurationDays;
  if (typeof data.expires_at === 'string') result.expiresAt = new Date(data.expires_at);
  if (typeof data.redeemed_by_telegram_id === 'string') {
    result.redeemedByTelegramId = data.redeemed_by_telegram_id;
  }
  return result;
};

export interface CouponRepository {
  findByCode(code: string): Promise<AccessCoupon | undefined>;
  findById(id: string): Promise<AccessCoupon | undefined>;
  createCoupon(input: CreateCouponInput): Promise<AccessCoupon>;
  createManyCoupons(inputs: CreateCouponInput[]): Promise<AccessCoupon[]>;
  cancelCoupon(
    code: string,
    now?: Date,
  ): Promise<{ status: 'cancelled' | 'already_cancelled' | 'redeemed' | 'expired' | 'not_found' }>;
  getCouponInfo(code: string, now?: Date): Promise<AccessCoupon | undefined>;
  redeemCouponAtomically(input: CouponRedeemInput): Promise<CouponRedemptionResult>;
}

export class SupabaseCouponRepository implements CouponRepository {
  private readonly client: SupabaseLike;

  constructor(client: SupabaseClient<Database>) {
    this.client = client as SupabaseLike;
  }

  async findByCode(code: string): Promise<AccessCoupon | undefined> {
    const normalized = normalizeCouponCode(code);
    if (!normalized.ok) return undefined;
    const { data, error } = await singleByCode(this.client, normalized.code);
    if (error) throw new Error(`Coupon lookup failed: ${error.message}`);
    return data ? mapCoupon(data) : undefined;
  }

  async findById(id: string): Promise<AccessCoupon | undefined> {
    const { data, error } = await singleById(this.client, id);
    if (error) throw new Error(`Coupon lookup failed: ${error.message}`);
    return data ? mapCoupon(data) : undefined;
  }

  async createCoupon(input: CreateCouponInput): Promise<AccessCoupon> {
    const [coupon] = await this.createManyCoupons([input]);
    if (!coupon) throw new Error('Coupon creation failed');
    return coupon;
  }

  async createManyCoupons(inputs: CreateCouponInput[]): Promise<AccessCoupon[]> {
    const rows = inputs.map((input) => ({
      code: input.code,
      duration_days: input.durationDays,
      status: input.status,
      source: input.source,
      created_by_user_id: input.createdByUserId ?? null,
      created_by_telegram_id: input.createdByTelegramId ?? null,
      issued_at: input.issuedAt.toISOString(),
      expires_at: input.expiresAt?.toISOString() ?? null,
    }));
    const inserter = this.client.from('access_coupons').insert(rows) as unknown as {
      select(columns?: string): Promise<QueryResult<CouponRow[]>>;
    };
    const { data, error } = await inserter.select('*');
    if (error) throw new Error(`Coupon creation failed: ${error.message}`);
    return (data ?? []).map(mapCoupon);
  }

  async cancelCoupon(
    code: string,
    now = new Date(),
  ): Promise<{ status: 'cancelled' | 'already_cancelled' | 'redeemed' | 'expired' | 'not_found' }> {
    const coupon = await this.getCouponInfo(code, now);
    if (!coupon) return { status: 'not_found' };
    if (coupon.status === 'cancelled') return { status: 'already_cancelled' };
    if (coupon.status === 'redeemed') return { status: 'redeemed' };
    if (coupon.status === 'expired') return { status: 'expired' };
    await updateByCode(this.client, coupon.code, {
      status: 'cancelled',
      updated_at: now.toISOString(),
    });
    return { status: 'cancelled' };
  }

  async getCouponInfo(code: string, now = new Date()): Promise<AccessCoupon | undefined> {
    const coupon = await this.findByCode(code);
    if (!coupon) return undefined;
    if (
      coupon.status === 'issued' &&
      coupon.expiresAt &&
      coupon.expiresAt.getTime() <= now.getTime()
    ) {
      const { data, error } = await updateByCode(this.client, coupon.code, {
        status: 'expired',
        updated_at: now.toISOString(),
      });
      if (error) throw new Error(`Coupon lazy expiration failed: ${error.message}`);
      if (!data) throw new Error('Coupon lazy expiration returned no row');
      return mapCoupon(data);
    }
    return coupon;
  }

  async redeemCouponAtomically(input: CouponRedeemInput): Promise<CouponRedemptionResult> {
    const normalized = normalizeCouponCode(input.code);
    if (!normalized.ok) return { status: 'not_found' };
    const { data, error } = await this.client.rpc('redeem_access_coupon', {
      p_code: normalized.code,
      p_telegram_id: input.telegramId,
      p_supabase_user_id: input.supabaseUserId,
      p_now: input.now.toISOString(),
    });
    if (error) return { status: 'temporary_error' };
    return asRedemptionResult(data);
  }
}
