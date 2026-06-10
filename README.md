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

## Этап 5: подарочные промокоды Strongest OS

Подарочный промокод — одноразовый купон из таблицы `access_coupons`, который даёт доступ на 30, 60 или 180 дней. Код можно передать другому человеку: доступ получает не создатель купона и не владелец username, а тот Telegram-пользователь, который первым успешно активировал нормализованный код в личном чате с ботом.

### Как работает активация

1. Пользователь нажимает `🎟 Активировать промокод`.
2. Бот требует private chat, проверяет свежий статус доступа и ставит conversation state `awaiting_coupon` на 10 минут.
3. Пользователь отправляет код одним сообщением. Бот делает `trim`, переводит код в uppercase, отклоняет пустые, многострочные, слишком длинные значения и Telegram-команды.
4. Перед активацией выполняется безопасная предварительная проверка купона, но окончательную гарантию даёт только backend RPC `redeem_access_coupon` через Supabase service role.
5. При успехе купон остаётся в базе со статусом `redeemed`, а subscription становится `active`.

Длительность берётся только из `access_coupons.duration_days`; текст кода (`STR-1M`, `STR-2M`, `STR-6M`) нужен только для удобства администратора и пользователя. Подарочный купон не меняет `trial_used`, `first_payment_at`, `last_payment_at`, не создаёт `payment_orders` и `payment_events`, поэтому право на льготный first month сохраняется, если пользователь ещё не покупал его ранее.

### Новый и существующий пользователь

Если у пользователя ещё нет Strongest OS Auth account, backend сначала создаёт аккаунт через существующий payment/access gateway, создаёт или получает pending subscription, а затем вызывает атомарное погашение. Если пользователь проиграл гонку за купон после создания аккаунта, дни не выдаются, pending subscription может остаться, пароль повторно не генерируется и второй аккаунт не создаётся.

Если аккаунт уже существует, бот не создаёт нового Auth user, не меняет пароль и не создаёт дублирующую subscription. RPC добавляет дни по общей UTC-формуле:

- если `subscriptions.expires_at` есть и находится в будущем, база продления — текущий `expires_at`;
- иначе база продления — `now()`;
- новый срок — `base + access_coupons.duration_days`.

После успешной активации выставляются `status = active`, `expires_at`, `current_period_end`, очищаются `expired_at`, `delete_after`, `marked_for_deletion_at`. Статусы `pending`, `expired`, `cancelled` и `marked_for_deletion` восстанавливаются в `active`; `banned` и `deleted` отклоняются без изменения купона.

### Атомарность и гонки

Migration `migrations/20260610_access_coupon_redemption.sql` добавляет диагностический запрос дублей, уникальный индекс `access_coupons_code_uidx` и RPC `redeem_access_coupon`. Функция в одной транзакции блокирует строку купона через `FOR UPDATE`, проверяет статус, expiration, допустимую длительность, затем блокирует subscription пользователя, проверяет `banned/deleted`, рассчитывает новый срок, обновляет subscription и только затем помечает купон `redeemed`.

Если два пользователя одновременно отправят один код, первый завершивший транзакцию получит дни, второй увидит `already_redeemed`. Повторная отправка уже погашенного кода не продлевает subscription второй раз.

Перед применением migration вручную проверьте дубли:

```sql
select code, count(*)
from access_coupons
group by code
having count(*) > 1;
```

### Admin-команды

Доступны только Telegram ID из `ADMIN_TELEGRAM_IDS`:

- `/admin_issue_coupon <days> [count]` — выпускает 1..100 купонов на 30, 60 или 180 дней, `source = admin`, `status = issued`.
- `/admin_coupon_info <code>` — показывает code, duration_days, status, source, issued_at, expires_at, redeemed_at, redeemed_by_telegram_id, created_by_telegram_id. При lookup применяется lazy expiration для истёкших `issued` купонов.
- `/admin_cancel_coupon <code>` — запрашивает подтверждение inline-кнопкой и отменяет только `issued` купон. `redeemed` купон нельзя отменить, запись не удаляется.

Если купонов много, бот отправляет список текстовым файлом, чтобы не превышать лимит Telegram-сообщения.

### Ручная проверка конкурентной активации

1. Примените migration `20260610_access_coupon_redemption.sql` к staging Supabase.
2. Выпустите один купон: `/admin_issue_coupon 30`.
3. Подготовьте двух тестовых Telegram-пользователей с subscription не `banned` и не `deleted`.
4. Почти одновременно отправьте один и тот же код обоим пользователям или вызовите backend flow параллельно из двух тестовых процессов.
5. Проверьте, что в `access_coupons` купон один раз перешёл в `redeemed`, `redeemed_by_telegram_id` заполнен только победителем, а из двух subscriptions продлена только одна.

### Что остаётся для этапа scheduler

В этом этапе intentionally не добавлены scheduler подписок, уведомления за 5/3/1 день и 1 час, физическое удаление пользователей, production webhook, Docker и GitHub Actions. Lazy expiration купонов выполняется при активации или admin lookup; отдельный фоновый scheduler истечения купонов остаётся для следующего этапа.

## Этап 6: автоматический жизненный цикл подписки

### Scheduler

Backend запускает `SchedulerRunner` только когда `SCHEDULER_ENABLED=true`. Интервал задаётся `SCHEDULER_INTERVAL_SECONDS`, batch-size — `SCHEDULER_BATCH_SIZE`. Один локальный процесс не начинает новый cycle, пока предыдущий не завершился, а защита от нескольких инстансов вынесена в Postgres advisory lock через RPC `try_acquire_subscription_scheduler_lock()` / `release_subscription_scheduler_lock()`.

Cycle использует единый UTC `now`, обрабатывает записи batch-ами и продолжает работу, если один пользователь завершился ошибкой. `SIGINT` и `SIGTERM` останавливают локальный interval и Telegram bot graceful shutdown. При занятом database lock цикл пропускается и логируется `scheduler_lock_skipped`; это не считается ошибкой.

### Напоминания и выбор актуального окна

Для `active` подписки scheduler отправляет только одно самое актуальное уведомление текущего периода:

- больше 5 дней до `expires_at` — ничего;
- от 3 до 5 дней — `five_days`;
- от 1 до 3 дней — `three_days`;
- от 1 часа до 1 дня — `one_day`;
- меньше 1 часа, но срок ещё не наступил — `one_hour`;
- `expires_at <= now` — `expired`.

Если scheduler пропустил несколько окон, старые окна не догоняются: при 2 днях уйдёт только `three_days`, при 40 минутах — только `one_hour`, после окончания — только `expired`.

### Защита от дублей уведомлений

`subscription_notifications` стала period-aware: migration добавляет `period_end timestamptz` и UNIQUE index по `(subscription_id, type, period_end)`. Это позволяет повторно отправлять `five_days`/`three_days`/другие уведомления после продления, но не отправлять дубль внутри одного периода.

Перед отправкой `NotificationService` атомарно резервирует запись через RPC `reserve_subscription_notification()`. Только процесс, получивший reservation token, отправляет Telegram message и затем выставляет `sent_at`. Temporary delivery errors освобождают reservation для retry; permanent errors (`bot blocked`, `chat not found`, deactivated user) помечают notification как `failed_permanent`, чтобы не спамить каждую минуту.

### Переход `active → expired` и хранение данных

Когда `status = active` и `expires_at <= now`, lifecycle делает условное обновление только если запись всё ещё active и `expires_at` всё ещё истёк. Устанавливаются:

- `status = expired`;
- `expired_at = expires_at`;
- `delete_after = expired_at + SUBSCRIPTION_RETENTION_DAYS`.

`trial_used`, `first_payment_at`, `last_payment_at` и `supabase_user_id` не меняются. Если пользователь оплатил параллельно и срок уже продлён, условное обновление не сработает и логируется skip due to renewal.

Для неполных `expired` записей lifecycle безопасно восстанавливает `expired_at` и `delete_after` из корректного `expires_at`. Если дата отсутствует или невалидна, пользователь не удаляется и запись остаётся для manual review.

### Deletion warning и удаление

Если `status = expired`, `delete_after > now` и до удаления осталось не больше `DELETION_WARNING_HOURS`, отправляется одно `deletion_warning`. Если `delete_after` уже наступил, старое предупреждение не отправляется: subscription условно переводится в `marked_for_deletion`, затем `AccountDeletionService` повторно загружает запись и проверяет, что доступ не восстановлен.

Оплата Telegram Stars и подарочный купон уже переводят subscription в `active` и сбрасывают `expired_at`, `delete_after`, `marked_for_deletion_at`; это отменяет удаление. Перед cleanup scheduler повторно читает subscription, поэтому reactivation перед удалением приводит к `deletion_cancelled_due_to_reactivation` и не удаляет данные/Auth user.

### Cleanup RPC и сохраняемые данные

Migration `20260610_subscription_lifecycle_scheduler.sql` добавляет RPC `cleanup_deleted_account_data(p_supabase_user_id uuid)`. RPC принимает только UUID пользователя, не принимает имена таблиц, работает идемпотентно и удаляет только allowlisted таблицы, если они существуют и имеют подтверждённую колонку `user_id`:

- `daily_focus`;
- `daily_reviews`;
- `cigarette_logs`;
- `daily_statuses`;
- `daily_notes`;
- `money_goals`;
- `bankrolls`;
- `incomes`;
- `tasks`;
- `quest_templates`;
- `player_profile`.

Не удаляются `payment_orders`, `payment_events`, `subscriptions` и данные других пользователей. После успешного RPC backend удаляет Supabase Auth user через Admin API, а затем минимально анонимизирует `bot_users` (`supabase_user_id`, `login_email`) и выставляет `subscriptions.status = deleted`, `deleted_at = now`. Если cleanup/Auth deletion падает, `deleted` не выставляется и повтор безопасен.

### Dry-run

При `SCHEDULER_DRY_RUN=true` используется та же selection logic, но scheduler только считает и логирует preview: не создаёт notifications, не отправляет Telegram messages, не меняет subscriptions, не вызывает cleanup RPC и не удаляет Auth user.

### Admin-команды

Все команды доступны только admin ID из `ADMIN_TELEGRAM_IDS`:

- `/admin_scheduler_status` — показывает enabled, interval, batch size, retention days, warning hours, dry-run, last run, last success, processed/errors;
- `/admin_scheduler_preview` — ничего не меняет и показывает counts по `five_days`, `three_days`, `one_day`, `one_hour`, `expired`, `deletion_warning`, `marked_for_deletion`, `deletion`;
- `/admin_run_scheduler` — запускает один cycle с database lock; в production при `SCHEDULER_DRY_RUN=false` требует `--confirm`;
- `/admin_subscription_lifecycle <telegram_id>` — показывает lifecycle поля и уведомления текущего периода.

### Migrations и безопасное тестирование

Для этапа 6 примените migration:

```sql
migrations/20260610_subscription_lifecycle_scheduler.sql
```

Перед production cleanup проверьте diagnostic queries из migration, foreign keys и allowlist таблиц на staging. Unit tests используют in-memory fakes, не production Supabase и не реальное удаление Auth user.

### Что остаётся для production deployment

Этап 6 не добавляет production webhook, Docker, GitHub Actions и deployment. Для следующего этапа остаётся deployment hardening: webhook/health endpoints, container/runtime configuration, CI/CD, observability и operational runbooks для Supabase migrations и cleanup verification.

## Production deployment guide (stage 7)

### Обязательные переменные окружения

Для production webhook-запуска задайте переменные в secret storage платформы, а не в Git:

- `NODE_ENV=production`
- `BOT_MODE=webhook`
- `BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`
- `ADMIN_TELEGRAM_IDS`
- `WEBHOOK_DOMAIN` — публичный HTTPS origin для Telegram webhook.
- `WEBHOOK_PATH` — путь endpoint, по умолчанию `/telegram/webhook`.
- `WEBHOOK_SECRET` — secret token Telegram webhook header.
- `PORT`
- `HOST=0.0.0.0`
- `WEBHOOK_AUTO_SETUP=true`
- `TRUST_PROXY=false` по умолчанию; включайте только за доверенным proxy.
- `HEALTH_CHECK_SUPABASE=true`
- `LOG_LEVEL=info`
- `SHUTDOWN_TIMEOUT_SECONDS=15`

Существующие переменные платежей, Supabase, купонов и scheduler остаются теми же: `FIRST_PERIOD_STARS`, `RENEWAL_PERIOD_STARS`, `FIRST_PERIOD_DAYS`, `RENEWAL_PERIOD_DAYS`, `PAYMENT_ORDER_TTL_MINUTES`, `SCHEDULER_ENABLED`, `SCHEDULER_INTERVAL_SECONDS`, `SCHEDULER_BATCH_SIZE`, `SUBSCRIPTION_RETENTION_DAYS`, `DELETION_WARNING_HOURS`, `SCHEDULER_DRY_RUN`.

### Polling и webhook режимы

Local development использует polling:

```bash
BOT_MODE=polling npm run dev
```

Production использует webhook и тот же composition root/handlers/services:

```bash
NODE_ENV=production BOT_MODE=webhook npm run start:webhook
```

Нельзя запускать polling и webhook одновременно для одного bot token. Если polling нужен как временный fallback, убедитесь, что работает только один экземпляр.

### HTTP endpoints

- `GET /health` возвращает только liveness: `{"status":"ok","service":"strongest-os-bot"}`.
- `GET /ready` возвращает `200 {"status":"ready"}` после валидного env, созданного composition root, Telegram `getMe`, HTTP server и scheduler init. При shutdown или ошибке Supabase readiness возвращает `503` с safe reason.
- `POST <WEBHOOK_PATH>` принимает Telegram updates только с `x-telegram-bot-api-secret-token`, ограничивает JSON body и не логирует полный update/body.

### Docker build и запуск container

```bash
docker build -t strongest-os-bot:latest .
docker run --rm --env-file .env -p 3000:3000 strongest-os-bot:latest
```

Docker image multi-stage: `npm ci`, TypeScript build, production runtime на Node.js 22, non-root user, запуск `node dist/index.js`, `.env`, `.git`, `node_modules`, `dist`, `coverage` и tests не копируются в runtime image.

### Настройка и проверка webhook

Startup сам вызывает `setWebhook`, если `BOT_MODE=webhook` и `WEBHOOK_AUTO_SETUP=true`. Разрешённые update types включают `message`, `callback_query`, `pre_checkout_query`.

Ручные безопасные команды:

```bash
npm run webhook:set
npm run webhook:info
npm run webhook:delete
```

Скрипты используют текущий env, не печатают bot token и webhook secret, а URL показывают masked.

### Scheduler

Scheduler запускается после успешной инициализации bot/HTTP startup и только при `SCHEDULER_ENABLED=true`. Он использует существующий database lock из миграций предыдущих этапов. Для безопасной проверки cleanup включите:

```bash
SCHEDULER_DRY_RUN=true
```

При shutdown scheduler прекращает новые cycles, а webhook не удаляется автоматически.

### Supabase migrations

Перед production deployment примените forward-only migrations из `migrations/` в порядке дат:

1. payment idempotency/constraints;
2. coupon redemption RPC;
3. subscription lifecycle scheduler lock, notification uniqueness, cleanup RPC and indexes.

Не выполняйте destructive down migrations в production и не откатывайте payment history.

### Проверки после deployment

```bash
curl -fsS https://<public-domain>/health
curl -fsS https://<public-domain>/ready
npm run webhook:info
```

Проверьте Telegram Stars на тестовом сценарии, выдачу и погашение gift coupon, lifecycle notifications, scheduler dry-run preview/status, а safe account deletion проверяйте только на тестовом аккаунте.

### Logs и graceful shutdown

Pino пишет structured JSON logs. Redaction покрывает token/service-role/webhook-secret/password/authorization headers. События startup/shutdown/readiness/webhook/scheduler логируются безопасными codes и без payload secrets.

`SIGINT` и `SIGTERM` переводят readiness в `503`, останавливают scheduler/polling, закрывают HTTP server и завершаются в пределах `SHUTDOWN_TIMEOUT_SECONDS`. Обычный shutdown не вызывает `deleteWebhook`.

### Admin-команды production status

Доступны только Telegram IDs из `ADMIN_TELEGRAM_IDS`:

- `/admin_webhook_status` — masked URL, pending updates, safe last error, allowed updates.
- `/admin_system_status` — environment, bot mode, uptime, readiness, webhook, scheduler flags, Supabase reachability, version/commit.
- `/admin_health_check` — read-only Telegram `getMe`, Supabase read, scheduler state, payment/coupon repository wiring.

### GitHub Actions CI

`.github/workflows/ci.yml` запускается на `push` и `pull_request`: checkout, setup Node 22, `npm ci`, format, lint, typecheck, tests, build. CI использует только dummy test env, не подключается к production Supabase, не ставит webhook и не запускает реальные destructive операции.

### Rollback

Безопасный rollback:

1. Верните предыдущий Docker image или commit.
2. Не откатывайте и не удаляйте `payment_events`, payment orders или coupon/payment history.
3. Не запускайте automatic down migrations.
4. При проблеме scheduler установите `SCHEDULER_ENABLED=false`.
5. При проблеме cleanup установите `SCHEDULER_DRY_RUN=true`.
6. При проблеме webhook выполните `npm run webhook:info` и проверьте masked status.
7. Временно используйте polling только в одном экземпляре, если webhook недоступен.
8. После исправления снова включите webhook и проверьте `/ready`.

### Manual production checklist

- [ ] Secrets заданы только в secret storage платформы.
- [ ] `.env` не закоммичен и не копируется в image.
- [ ] `WEBHOOK_DOMAIN` использует HTTPS.
- [ ] `WEBHOOK_SECRET` достаточно длинный и не совпадает с path.
- [ ] Migrations применены forward-only.
- [ ] `npm run webhook:info` показывает ожидаемый masked URL.
- [ ] `/health` и `/ready` возвращают 200 после startup.
- [ ] Scheduler status проверен, cleanup сначала проверен с dry-run.
- [ ] Telegram Stars, coupons, notifications и safe deletion проверены на тестовых данных.
- [ ] Rollback image/commit известен.
