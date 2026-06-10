import { Markup } from 'telegraf';
import { CALLBACK_DATA } from '../config/constants.js';
import type { AppEnv } from '../config/env.js';
import type {
  NotificationRepository,
  NotificationType,
} from '../repositories/notificationRepository.js';
import { formatDateTime } from '../utils/dates.js';
import { logger, normalizeError } from '../utils/logger.js';

export interface NotificationService {
  enqueue(telegramId: string, message: string): Promise<{ status: 'not_configured' }>;
  sendLifecycleNotification(input: {
    subscriptionId: string;
    telegramId: string;
    type: NotificationType;
    periodEnd: Date;
    now: Date;
  }): Promise<'sent' | 'duplicate' | 'failed_temporary' | 'failed_permanent' | 'dry_run'>;
}

export class MockNotificationService implements NotificationService {
  enqueue(_telegramId: string, _message: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }

  async sendLifecycleNotification(): Promise<'dry_run'> {
    await Promise.resolve();
    return 'dry_run';
  }
}

export interface TelegramSender {
  sendMessage(chatId: string | number, text: string, extra?: object): Promise<unknown>;
}

export interface TelegramDeliveryFailure {
  permanent: boolean;
  retryAfter?: Date;
}

const notificationKeyboard = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('Оформить доступ', CALLBACK_DATA.navPlans)],
    [Markup.button.callback('Активировать промокод', CALLBACK_DATA.couponStart)],
    [Markup.button.callback('Мой доступ', CALLBACK_DATA.navAccess)],
  ]);

export const buildLifecycleNotificationText = (
  type: NotificationType,
  periodEnd: Date,
  env: AppEnv,
): string => {
  const date = formatDateTime(periodEnd, env.displayTimezone);
  const retentionDays = env.subscriptionRetentionDays ?? 60;
  const warningHours = env.deletionWarningHours ?? 24;
  switch (type) {
    case 'five_days':
      return `До окончания доступа Strongest OS осталось 5 дней.\n\nТекущая дата окончания: ${date}\n\nВы можете продлить доступ заранее. Оставшиеся дни не сгорят.`;
    case 'three_days':
      return 'До окончания доступа Strongest OS осталось 3 дня.\n\nПри продлении новый период добавится к текущему сроку.';
    case 'one_day':
      return `Доступ Strongest OS закончится завтра.\n\nДата окончания: ${date}\n\nПродлите доступ заранее, чтобы избежать перерыва.`;
    case 'one_hour':
      return `До окончания доступа Strongest OS остался примерно 1 час.\n\nПосле окончания доступ будет заблокирован, но данные сохранятся ещё на ${retentionDays} дней.`;
    case 'expired':
      return `Срок доступа Strongest OS закончился.\n\nВаши данные сохранены ещё на ${retentionDays} дней.\n\nВы можете восстановить доступ оплатой или подарочным промокодом.`;
    case 'deletion_warning':
      return `Данные Strongest OS будут удалены примерно через ${warningHours} часов.\n\nПосле удаления восстановить квесты, заметки и прогресс будет невозможно.\n\nЧтобы сохранить данные, оформите доступ или активируйте промокод.`;
    case 'deleted':
      return 'Данные Strongest OS удалены после завершения срока хранения. История платежей сохранена для поддержки и антидублей.';
  }
};

const errorField = (error: unknown, field: string): unknown =>
  typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)[field]
    : undefined;

export const classifyTelegramError = (error: unknown, now: Date): TelegramDeliveryFailure => {
  const normalized = normalizeError(error);
  const message = normalized.message.toLowerCase();
  const codeRaw = errorField(error, 'code') ?? errorField(error, 'error_code');
  const code = typeof codeRaw === 'number' ? codeRaw : undefined;
  const parameters = errorField(error, 'parameters');
  const retryAfterRaw =
    typeof parameters === 'object' && parameters !== null
      ? (parameters as Record<string, unknown>).retry_after
      : undefined;
  const retryAfterSeconds = typeof retryAfterRaw === 'number' ? retryAfterRaw : undefined;

  if (
    code === 403 ||
    code === 400 ||
    message.includes('bot was blocked') ||
    message.includes('chat not found') ||
    message.includes('user is deactivated') ||
    message.includes('deactivated')
  ) {
    return { permanent: true };
  }
  if (code === 429 || retryAfterSeconds) {
    return {
      permanent: false,
      retryAfter: new Date(now.getTime() + (retryAfterSeconds ?? 60) * 1000),
    };
  }
  return { permanent: false };
};

export class DefaultNotificationService implements NotificationService {
  private readonly reservationTtlSeconds = 300;

  constructor(
    private readonly repository: NotificationRepository,
    private readonly telegram: TelegramSender,
    private readonly env: AppEnv,
    private readonly dryRun = false,
  ) {}

  enqueue(_telegramId: string, _message: string): Promise<{ status: 'not_configured' }> {
    return Promise.resolve({ status: 'not_configured' });
  }

  async sendLifecycleNotification(input: {
    subscriptionId: string;
    telegramId: string;
    type: NotificationType;
    periodEnd: Date;
    now: Date;
  }): Promise<'sent' | 'duplicate' | 'failed_temporary' | 'failed_permanent' | 'dry_run'> {
    if (this.dryRun) {
      logger.info({ telegramId: input.telegramId, type: input.type }, 'notification_dry_run');
      return 'dry_run';
    }

    const reservation = await this.repository.reserveNotification({
      ...input,
      reservationTtlSeconds: this.reservationTtlSeconds,
    });
    if (!reservation) return 'duplicate';
    logger.info({ telegramId: input.telegramId, type: input.type }, 'notification_reserved');

    try {
      await this.telegram.sendMessage(
        input.telegramId,
        buildLifecycleNotificationText(input.type, input.periodEnd, this.env),
        {
          parse_mode: 'HTML',
          ...notificationKeyboard(),
        },
      );
      await this.repository.markSent({
        notificationId: reservation.notification.id,
        token: reservation.token,
        sentAt: input.now,
      });
      logger.info({ telegramId: input.telegramId, type: input.type }, 'notification_sent');
      return 'sent';
    } catch (error) {
      const failure = classifyTelegramError(error, input.now);
      await this.repository.releaseReservation({
        notificationId: reservation.notification.id,
        token: reservation.token,
        ...(failure.retryAfter ? { retryAfter: failure.retryAfter } : {}),
        permanent: failure.permanent,
        now: input.now,
      });
      logger.warn(
        {
          err: normalizeError(error),
          telegramId: input.telegramId,
          type: input.type,
          permanent: failure.permanent,
        },
        'notification_delivery_failed',
      );
      return failure.permanent ? 'failed_permanent' : 'failed_temporary';
    }
  }
}
