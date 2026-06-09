# Strongest OS Production Telegram Bot

Этот репозиторий содержит отдельный production backend Telegram-бота Strongest OS. Он не содержит сайт, frontend, Next.js-приложение или пользовательские страницы Strongest OS.

## Стек

- Node.js LTS 22+
- TypeScript в strict mode
- Telegraf для Telegram Bot API
- Zod для проверки переменных окружения
- Pino для безопасного структурированного логирования
- `@supabase/supabase-js` как заготовка Supabase Admin-интеграции
- Vitest для unit-тестов
- ESLint и Prettier
- `tsx` для локального запуска TypeScript

## Структура директорий

```text
src/
  commands/       команды /start и /admin
  config/         env, callback/menu constants, pricing
  handlers/       обработчики меню, callback queries, текста и неизвестных сообщений
  integrations/   Supabase Admin-заготовка
  keyboards/      Reply/Inline клавиатуры
  middleware/     user context, errors, admin guard, rate limiting
  payments/       PaymentProvider, mock provider, Telegram Stars-заготовка
  repositories/   интерфейсы будущего слоя данных
  scheduler/      заготовка scheduler
  services/       mock/domain services
  state/          conversation state abstractions
  types/          доменные типы
  utils/          logger, messages, telegram helpers, dates
tests/            unit-тесты без Telegram/Supabase-сети
```

## Установка

1. Установите Node.js 22 LTS или новее.
2. Установите зависимости:

```bash
npm install
```

3. Создайте локальный `.env` на основе безопасного шаблона:

```bash
cp .env.example .env
```

Не коммитьте `.env`: он предназначен только для локальных секретов и исключён через `.gitignore`.

## Переменные окружения

```env
BOT_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=https://strongest.sanau-ai.kz
ADMIN_TELEGRAM_IDS=
SUPPORT_USERNAME=
NODE_ENV=development
BOT_MODE=polling
WEBHOOK_DOMAIN=
WEBHOOK_SECRET=
PORT=3000
FIRST_PERIOD_STARS=100
RENEWAL_PERIOD_STARS=150
FIRST_PERIOD_DAYS=30
RENEWAL_PERIOD_DAYS=30
```

- `BOT_TOKEN` обязателен для фактического запуска бота.
- `SUPABASE_SERVICE_ROLE_KEY` хранится только в `.env` или защищённом secret storage. Не вставляйте его в код, README, тесты или logs.
- `ADMIN_TELEGRAM_IDS` — Telegram ID через запятую. Username не используется для доступа администратора.
- `APP_URL` используется для URL-кнопки «Открыть Strongest OS».

## Получение Bot Token

1. Откройте Telegram и найдите `@BotFather`.
2. Создайте бота командой `/newbot`.
3. Скопируйте выданный token в локальный `.env` как `BOT_TOKEN`.
4. Не публикуйте token и не отправляйте его в чат.

## Локальный запуск через long polling

```bash
npm run dev
```

Бот запускается в `BOT_MODE=polling`. Для остановки нажмите `Ctrl+C`; приложение обработает `SIGINT` и корректно остановит Telegraf.

Production build:

```bash
npm run build
npm run start
```

## Пользовательские команды и кнопки

Команды:

- `/start` — сбрасывает временное состояние и показывает главное меню.
- `/admin` — показывает mock-панель только Telegram ID из `ADMIN_TELEGRAM_IDS`.

Главное меню:

- 🚀 Оформить доступ
- 👤 Мой доступ
- 🎟 Активировать промокод
- 🔑 Восстановить доступ
- 📦 Что входит
- 📲 Как установить приложение
- 📄 Условия
- 🆘 Поддержка

## Mock-функции текущего этапа

На этом этапе намеренно не выполняются реальные бизнес-операции:

- платежи Telegram Stars не создают invoices;
- Supabase Auth users не создаются;
- подписки не продлеваются;
- промокоды не погашаются в базе;
- восстановление доступа не генерирует пароль;
- уведомления и scheduler не отправляют реальные события.

Mock-сервисы явно возвращают `not_configured` или `unavailable`, чтобы не создавать ложное впечатление реального доступа.

## Проверки качества

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Форматирование:

```bash
npm run format
```

## Типовые ошибки запуска

- `Missing required configuration: BOT_TOKEN` — заполните `BOT_TOKEN` в локальном `.env`.
- `Invalid configuration: APP_URL` — проверьте, что `APP_URL` является валидным URL.
- `Invalid ADMIN_TELEGRAM_IDS` — используйте только числовые Telegram ID через запятую.
- Бот не отвечает — убедитесь, что нет другого long polling/webhook-процесса с тем же token.

## Будущие этапы

- Telegram Stars invoices, `pre_checkout_query`, `successful_payment`.
- Supabase Auth user provisioning.
- Реальные таблицы подписок, платежей, купонов и уведомлений.
- Реальное продление/истечение/блокировка подписок.
- Webhook + health endpoints.
- Scheduler напоминаний и удаления данных.
- CI/CD, Docker и deployment hardening.
