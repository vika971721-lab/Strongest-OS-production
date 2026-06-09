export const now = (): number => Date.now();

export const isOlderThan = (startedAt: number, ttlMs: number, nowMs = Date.now()): boolean =>
  nowMs - startedAt > ttlMs;

export const DEFAULT_DISPLAY_TIMEZONE = 'Asia/Almaty';

export const isValidIanaTimeZone = (timeZone: string): boolean => {
  try {
    Intl.DateTimeFormat('ru-RU', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

export const formatDateTime = (
  value: Date | string | undefined | null,
  timeZone = DEFAULT_DISPLAY_TIMEZONE,
): string => {
  if (!value) return 'дата не указана';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'дата указана некорректно';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(' г. в ', ', ');
};

const plural = (value: number, one: string, few: string, many: string): string => {
  const abs = Math.abs(value);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const formatUnit = (value: number, unit: 'day' | 'hour' | 'minute'): string => {
  if (unit === 'day') return `${value} ${plural(value, 'день', 'дня', 'дней')}`;
  if (unit === 'hour') return `${value} ${plural(value, 'час', 'часа', 'часов')}`;
  return `${value} ${plural(value, 'минута', 'минуты', 'минут')}`;
};

export const formatRemainingTime = (
  value: Date | string | undefined | null,
  nowMs = Date.now(),
): string => {
  if (!value) return 'срок не указан';
  const date = value instanceof Date ? value : new Date(value);
  const endMs = date.getTime();
  if (Number.isNaN(endMs)) return 'срок указан некорректно';
  const diffMs = endMs - nowMs;
  if (diffMs <= 0) return 'срок закончился';

  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 1) return 'меньше минуты';

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0
      ? `${formatUnit(days, 'day')} ${formatUnit(hours, 'hour')}`
      : formatUnit(days, 'day');
  }
  if (hours > 0) {
    return minutes > 0
      ? `${formatUnit(hours, 'hour')} ${formatUnit(minutes, 'minute')}`
      : formatUnit(hours, 'hour');
  }
  return formatUnit(minutes, 'minute');
};

export const formatDeletionRemainingTime = (
  value: Date | string | undefined | null,
  nowMs = Date.now(),
): string => {
  if (!value) return 'Дата удаления пока не назначена.';
  const remaining = formatRemainingTime(value, nowMs);
  if (remaining === 'срок закончился') return 'Удаление может быть выполнено в ближайшее время.';
  return remaining;
};
