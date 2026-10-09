---
paths:
    - 'src/**/*.errors.ts'
    - 'src/**/*.error-statuses.ts'
    - 'src/app/error-statuses.ts'
    - 'src/shared/http/exception.filter.ts'
    - 'src/shared/http/validation.ts'
---

# Ошибки

## Формат ответа

Любой ответ с ошибкой — одно тело:

```json
{
    "code": "ACCESS_CODE_ALREADY_USED",
    "message": "Access code was already used",
    "details": { "unitId": "0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10" },
    "requestId": "8d3f2a1e-6b7c-4e21-9f0a-2c5d8e7b1a90"
}
```

- `code` — UPPER_SNAKE_CASE с префиксом модуля. Клиент показывает пользователю свой текст по коду.
- `message` — английский текст для разработчиков, клиент его не показывает.
- `details` — необязательные структурированные данные. Секретов и чужих данных в них нет.
- `requestId` — тот же id, что в заголовке `X-Request-Id` и в журнале.
- HTTP-статус сохраняет смысл: 400, 401, 403, 404, 409, 429, 500.

## Доменная ошибка

- В `domain/<модуль>.errors.ts` — тип кодов и класс ошибки с `code`, `message`, `details`. Без HTTP. Общего базового класса нет: `domain/` ничего не импортирует.
- В `presentation/<модуль>.error-statuses.ts` — таблица «код → статус» на все коды модуля. Файл называется именно так: по суффиксу его находит тест реестра.
- Таблица модуля добавляется в `ERROR_STATUSES` в `src/app/error-statuses.ts`. Код, которого нет в реестре, уходит как 500.
- У модуля без HTTP таблицы нет, пока его ошибки не доходят до клиента: так устроены `jobs` и `structure`.
  Как только ошибка модуля может дойти до клиента — через свой или чужой эндпоинт, — таблица заводится, даже если контроллеров у модуля нет.
- `domain/`, `application/` и `infrastructure/` бросают только доменные ошибки. `HttpException` и его наследники — только в `presentation/`.

```ts
export type AccessErrorCode =
    'ACCESS_CODE_ALREADY_USED' | 'ACCESS_CODE_NOT_FOUND';

export class AccessError extends Error {
    constructor(
        readonly code: AccessErrorCode,
        message: string,
        readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'AccessError';
    }
}

export const ACCESS_ERROR_STATUSES = {
    ACCESS_CODE_ALREADY_USED: 409,
    ACCESS_CODE_NOT_FOUND: 404,
} satisfies Record<AccessErrorCode, number>;
```

## Что делает фильтр

| Что пришло                            | Статус            | `code`                              |
| ------------------------------------- | ----------------- | ----------------------------------- |
| Ошибка с кодом из реестра             | из таблицы        | код ошибки                          |
| `HttpException` с телом `{ code, … }` | статус исключения | код из тела                         |
| Остальные `HttpException`             | статус исключения | имя статуса: `NOT_FOUND`            |
| Ошибка клиента от парсера тела (4xx)  | этот статус       | имя статуса: `PAYLOAD_TOO_LARGE`    |
| Всё остальное                         | 500               | `INTERNAL_ERROR`, подробности в лог |

Модули своих фильтров не заводят.

## Частные случаи

- **Валидация запроса** — 400 `VALIDATION_FAILED`; в `details.fields` путь к полю и имена нарушенных правил: `{ "path": "profile.name", "rules": ["minLength"] }`.
- **Лимит** — 429 с `details.retryAfterSeconds`; фильтр сам ставит заголовок `Retry-After`.
  Бросает его только `throttle`: `THROTTLE_RATE_LIMITED` — слишком часто, `THROTTLE_ATTEMPTS_LOCKED` — закрыто после неверных попыток.
  Клиент берёт время из тела: заголовок скрипту страницы с другого адреса не виден.

## Проверяется автоматически

- `tsc`: таблица модуля содержит все его коды.
- `test/unit/errors/error-statuses-registry.spec.ts`: каждая таблица из `*.error-statuses.ts` есть в `ERROR_STATUSES` с тем же статусом.
- oxlint: `application/` и `infrastructure/` не импортируют `HttpException` и его наследников; `domain/` не импортирует Nest вообще.
- `test/e2e/errors/errors.e2e-spec.ts`: каждая строка таблицы «Что делает фильтр», формат ошибки валидации, `Retry-After` у 429, `requestId` в теле и заголовке.

## Не проверяется

- Имена кодов и префикс модуля.
- Секреты и чужие данные в `details`.
