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

## Этап 4: Telegram Stars payments

Strongest OS продаёт цифровой доступ внутри Telegram через Telegram Stars. Для invoice используется `currency = XTR`, потому что Telegram Stars требуют валюту XTR для цифровых товаров, и `provider_token = ""`, потому что внешний платёжный провайдер для Stars не нужен. В invoice создаётся ровно один `LabeledPrice`; shipping, tips, телефон, email, адрес, внешние checkout URL и recurring subscriptions не используются.

### Pricing config

Единый pricing config читается из env и валидируется Zod как положительные целые числа:

- `FIRST_PERIOD_STARS` — цена первого периода, default `100`;
- `RENEWAL_PERIOD_STARS` — цена продления, default `150`;
- `FIRST_PERIOD_DAYS` — длительность первого периода, default `30`;
- `RENEWAL_PERIOD_DAYS` — длительность продления, default `30`;
- `PAYMENT_ORDER_TTL_MINUTES` — срок жизни pending order, default `15`;
- `DISPLAY_TIMEZONE` — timezone отображения дат, default `Asia/Almaty`.

### Тарифы first_month и monthly_renewal

Тариф определяется только по свежему состоянию пользователя и `subscriptions.trial_used`:

- subscription отсутствует или `trial_used = false` → `first_month`;
- `trial_used = true` → `monthly_renewal`;
- `banned`, `deleted`, broken account link, unknown status или временная ошибка базы → invoice не создаётся.

Проверка выполняется при открытии экрана, перед созданием order, в `pre_checkout_query` и при `successful_payment`; старая кнопка или старый invoice не считаются источником истины.

### Payment order и invoice

При нажатии `🚀 Оформить доступ` бот требует private chat, получает актуальное состояние пользователя, выбирает тариф, создаёт `payment_orders` order и короткий opaque `provider_invoice_payload` через `node:crypto`. Payload не содержит Telegram ID, email, UUID или секреты. Если для того же пользователя и плана уже есть pending order младше TTL, он переиспользуется; просроченный order помечается `expired`, paid order не меняется.

После записи order бот отправляет Telegram Stars invoice с `provider_token = ""`, `currency = "XTR"`, одним price и payload order. Только после успешной отправки order помечается `pending`; при ошибке отправки order помечается `failed`.

### Pre-checkout

Handler `pre_checkout_query` всегда отвечает Telegram. Он проверяет invoice payload, order, статус, TTL, владельца order, `XTR`, сумму, provider, plan, повторную eligibility проверку первого тарифа, а также запреты `banned`, `deleted` и broken link. В pre-checkout не создаются Auth users, не генерируются пароли и не продлевается subscription.

### Successful payment и идемпотентность

Доступ выдаётся только после Telegram message с `successful_payment`. Основным ключом идемпотентности является `successful_payment.telegram_payment_charge_id`, который сохраняется как `payment_events.provider_event_id`; `provider_payment_charge_id` сохраняется дополнительно в sanitized raw payload/order. Если event уже processed, повторная доставка Telegram update не продлевает доступ повторно и показывает актуальный срок.

Raw payload хранит только безопасные поля: currency, amount, invoice payload, Telegram/provider charge IDs, message/update IDs и timestamp. Полный ctx, секреты, пароль, env и история чата не сохраняются.

### Account, subscription, retry и partial failures

Supabase Auth account создаётся только после confirmed `successful_payment`. Если account уже существует, пароль не сбрасывается. Если account новый, пароль отправляется пользователю один раз в private chat; бот не сохраняет пароль и не отправляет его администраторам. Продление считается по формуле `base = expires_at > now ? expires_at : now`, затем добавляется оплаченный период; `trial_used` становится `true`, `first_payment_at` устанавливается только один раз, deletion markers очищаются.

Partial failures не теряют платёж: event создаётся до account/subscription операций. Если AccountService или subscription update временно упали, unprocessed event можно безопасно догнать через пользовательскую кнопку `Проверить последнюю оплату` или admin retry. Для production добавлена SQL migration с UNIQUE constraints и RPC-заготовкой, чтобы subscription extension и `payment_events.processed_at` выполнялись атомарно в Postgres transaction.

Особые статусы:

- `expired`, `cancelled`, `marked_for_deletion` после оплаты восстанавливаются в `active`;
- `banned` и `deleted` не активируются автоматически, payment event сохраняется для manual review;
- race двух invoice первого тарифа конвертируется в обычное продление с audit event `first_month_race_converted_to_renewal`.

### Пользовательская проверка и поддержка оплат

Добавлены callback `Проверить последнюю оплату` и команда `/paysupport`. Пользователь видит инструкцию: не оплачивать повторно, проверить последнюю оплату и обратиться в поддержку, если Stars списаны, а доступ не появился.

### Admin-команды оплаты

- `/admin_payment <order_id>` — показывает безопасную информацию об order, events и subscription без UUID/секретов/паролей для пользователя;
- `/admin_retry_payment <order_id>` — разрешена только admin, требует существующий successful payment event, не создаёт fake payment и не продлевает processed event повторно;
- `/admin_extend <telegram_id> <days> [reason]` — admin-only ручное продление на 1..365 дней, без payment_event и без изменения `trial_used`, с audit log `admin_extension`.

### Manual checklist

1. В private chat открыть экран тарифа и нажать `🚀 Оформить доступ`.
2. Убедиться, что Telegram invoice в XTR, сумма соответствует тарифу, provider token пустой.
3. Оплатить invoice тестовыми Stars.
4. Проверить, что до `successful_payment` доступ не выдан.
5. После `successful_payment` проверить создание account только при первой покупке, выдачу пароля только в private chat и активную subscription на оплаченный период.
6. Повторить update/payment delivery и убедиться, что срок не продлевается второй раз.
7. Нажать `Проверить последнюю оплату` при pending/paid/unprocessed сценариях.
8. Проверить `/admin_payment`, `/admin_retry_payment`, `/admin_extend` под admin и отказ для обычного пользователя.

### Что остаётся для этапа промокодов

На следующем этапе остаются `access_coupons`, подарочные промокоды и их реальное погашение. Scheduler, production webhook, Docker и GitHub Actions по-прежнему не входят в этап Telegram Stars.
