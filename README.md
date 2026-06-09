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

## Этап 3: production Telegram UI перед Telegram Stars

### Главное меню

Постоянная Reply Keyboard содержит восемь пользовательских действий: «🚀 Оформить доступ», «👤 Мой доступ», «🎟 Активировать промокод», «🔑 Восстановить доступ», «📦 Что входит», «📲 Как установить приложение», «📄 Условия», «🆘 Поддержка». Отдельные кнопки «Купить подписку» и «Продлить доступ» не добавляются: один пункт «Оформить доступ» динамически показывает первый период или продление.

### Пользовательские команды

Публичный список команд подготовлен централизованно для будущего `setMyCommands`:

- `/start` — открыть бота и главное меню;
- `/menu` — сбросить временное состояние и показать меню;
- `/status` — открыть тот же экран, что «👤 Мой доступ»;
- `/help` — показать пользовательскую помощь без admin-команд;
- `/cancel` — отменить текущий conversation state.

Admin-команды не включаются в публичный список. В development бот пробует зарегистрировать публичные команды один раз при запуске и безопасно логирует ошибку регистрации.

### Пользовательские состояния

UI использует отдельную discriminated union-модель `UserAccessState`: `unregistered`, `telegram_registered`, `account_pending`, `active`, `expired`, `cancelled`, `banned`, `marked_for_deletion`, `deleted`, `broken_link`, `unknown_status`, `temporarily_unavailable`. Эти значения не записываются в `subscriptions.status` и нужны только для Telegram-интерфейса.

### Как определяется первый тариф

Единый источник тарифов — `pricing` из env config:

- первый период: `FIRST_PERIOD_STARS` и `FIRST_PERIOD_DAYS`, по умолчанию 100 Stars и 30 дней;
- продление: `RENEWAL_PERIOD_STARS` и `RENEWAL_PERIOD_DAYS`, по умолчанию 150 Stars и 30 дней;
- валюта будущего платежа — `XTR`.

UI выбирает первый тариф только если `trial_used` из состояния подписки не равен `true`. `null`/отсутствующее значение на UI-этапе трактуется как `false` только в нормализованном состоянии, но временная ошибка базы не превращается в право на первый тариф.

### Почему UI не является окончательной защитой тарифа

Экран тарифа — информационный. Он не создаёт Telegram invoice, payment order, payment event, активную подписку и не меняет `trial_used`. На этапе Telegram Stars будущий payment flow обязан повторно получить свежие данные из базы и атомарно проверить право на первый тариф перед оплатой/выдачей доступа.

### Как отображаются subscription statuses

- `pending`: аккаунт создан, активного доступа нет, показывается login email без пароля.
- `active`: показываются дата окончания, оставшееся время и login email.
- `expired`: показываются дата окончания и срок до удаления; если `delete_after` отсутствует, выводится «Дата удаления пока не назначена».
- `cancelled`: выбранное поведение — доступ считается отменённым для Telegram UI, восстановление возможно новым периодом или промокодом. Схема не содержит отдельного признака «доступ до конца периода», поэтому UI не обещает продолжение доступа после cancelled.
- `banned`: тарифные и coupon-действия блокируются, предлагается поддержка.
- `marked_for_deletion`: показываются дата удаления и оставшееся время; отрицательное время не выводится.
- `deleted`: не показывается старый login email и не обещается восстановление удалённых данных.
- неизвестный status: fail-closed, логируется безопасное событие и предлагается поддержка.

### Как работает timezone

Для пользовательских дат используется `DISPLAY_TIMEZONE`, по умолчанию `Asia/Almaty`. Значение валидируется как IANA timezone; при невалидном значении `parseEnv` завершится ошибкой конфигурации. Формат даты: `25 июля 2026, 15:00` с русской локалью.

### Как работает «Мой доступ»

`/status` и кнопка «👤 Мой доступ» используют общий handler. Handler каждый раз получает свежий `UserAccessState`, не доверяет callback data и не показывает внутренние UUID или raw database errors. При временной ошибке показывается экран «Не удалось загрузить данные аккаунта» с inline-кнопкой «Повторить».

### Как работает password reset

Кнопка «🔑 Восстановить доступ» показывает login email и требует подтверждения inline-кнопкой «Создать новый пароль». Reset не выполняется без подтверждения. В группе пароль не отправляется; бот просит открыть личный чат. Для banned reset может быть разрешён, но сообщение предупреждает, что блокировка не снимается. Для deleted и broken link reset не предлагается.

### Как бот ведёт себя в группах

Sensitive handlers защищены `requirePrivateChat`: в group/supergroup бот не показывает login email, status, credentials, не принимает промокод и не сбрасывает пароль. Пользователь получает сообщение, что Strongest OS работает в личном чате; если username бота доступен, добавляется URL-кнопка личного чата.

### Какие действия пока являются mock

На этапе 3 mock/информационные действия:

- Telegram Stars invoice не создаётся;
- payment orders/events не создаются;
- доступ не активируется и не продлевается;
- `trial_used` не меняется;
- промокоды не погашаются;
- scheduler, notifications и production webhook не реализуются.

### Что будет реализовано на этапе Telegram Stars

Следующий этап должен добавить invoice, `pre_checkout_query`, `successful_payment`, payment orders/events, атомарную повторную проверку `trial_used`, создание Supabase Auth user после успешной оплаты, продление/возобновление подписки и реальное погашение подарочных промокодов.

### Как вручную проверить каждый UI-state

В development доступна admin-only команда без записи в Supabase:

```bash
/admin_preview_status <status>
```

Допустимые preview: `unregistered`, `pending`, `active`, `expired`, `cancelled`, `banned`, `marked_for_deletion`, `deleted`, `broken_link`, `error`. Команда отключена в `NODE_ENV=production` и не меняет пользователя, подписку или Auth account.

### Как настроить SUPPORT_USERNAME

`SUPPORT_USERNAME` можно указать с `@` или без него. Пробелы убираются, username валидируется по правилам Telegram (`A-Z`, `a-z`, `0-9`, `_`, длина 5–32). Если значение невалидно или отсутствует, URL-кнопка поддержки не создаётся.

### Как настроить DISPLAY_TIMEZONE

Добавьте в локальный `.env` при необходимости:

```env
DISPLAY_TIMEZONE=Asia/Almaty
```

Если переменная отсутствует, используется default `Asia/Almaty`. Реальный `.env` не требуется менять для запуска существующей конфигурации.
