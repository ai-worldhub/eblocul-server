---
paths:
    - 'src/*/*/domain/**'
    - 'src/*/*/ports/**'
    - 'src/*/*/application/**'
    - 'src/*/*/infrastructure/**'
    - 'src/*/*/presentation/**'
    - 'src/*/*/*.module.ts'
---

# Слои модуля

## Раскладка

```
src/core/<модуль>/  или  src/modules/<модуль>/
  index.ts                        всё, что открыто другим модулям
  <модуль>.module.ts              связывает слои и порты с реализациями
  domain/                         правила предметной области
    <предмет>.entity.ts
    <модуль>.errors.ts
  ports/                          абстрактные классы: всё, что модулю нужно снаружи
    <предмет>.repository.ts
    <что>.port.ts
  application/                    сценарии
    <тема>.service.ts
    <модуль>.log-events.ts
  infrastructure/                 реализации портов
    prisma/<предмет>.repository.ts
    <модель>.select.ts
  presentation/                   HTTP
    <модуль>.controller.ts
    <модуль>.error-statuses.ts
    dto/<сущность>.dto.ts
```

Слой, который модулю не нужен, не создаётся.

## Кто кого импортирует

| Слой              | Может                                                                               | Не может                                                                |
| ----------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `domain/`         | только `domain/` своего модуля                                                      | другие слои и модули, `shared/`, `generated/`, `@nestjs/*`, `@prisma/*` |
| `ports/`          | `domain/`, `shared/`, `index.ts` ядра                                               | другие слои, `generated/`, `@nestjs/*`, `@prisma/*`                     |
| `application/`    | `domain/`, `ports/`, `infrastructure/*.select.ts`, `shared/`, `index.ts` ядра       | остальной `infrastructure/`, `presentation/`                            |
| `infrastructure/` | `domain/`, `ports/`, `shared/`, `generated/`, `index.ts` ядра                       | `application/`, `presentation/`                                         |
| `presentation/`   | `application/`, `domain/`, `infrastructure/*.select.ts`, `shared/`, `index.ts` ядра | `ports/`, остальной `infrastructure/`                                   |

## Что из этого следует

- **Правила живут в `domain/`.** Условие по состоянию сущности в сервисе или контроллере — ошибка: правило ушло из entity.
- **Время и id приходят в `domain/` параметрами.** Entity не вызывает `new Date()` и не создаёт id. Сервис берёт их из `Clock` и `Ids`; id сущности, которую создаёт клиент, — из запроса.
- **Доменная ошибка не знает HTTP.** Статус ей назначает таблица в `presentation/`.
- **`application/` не знает о DTO.** Сервис принимает свои типы входа и возвращает доменное представление или тип выборки. DTO объявляет контроллер.
- **Контроллер тонкий:** разбирает запрос, вызывает один метод сервиса, возвращает DTO.
- **Всё, что модулю нужно снаружи, — порт:** абстрактный класс в `ports/`, реализация в `infrastructure/`, связь в `<модуль>.module.ts`. В `domain/` абстрактных классов для DI нет. Подробности — `ports.md`.

```ts
export class AccessCodeEntity {
    private constructor(private state: AccessCodeState) {}

    static issue(input: {
        id: string;
        unitId: string;
        now: Date;
    }): AccessCodeEntity {
        return new AccessCodeEntity({
            ...input,
            usedAt: null,
            issuedAt: input.now,
        });
    }

    use(now: Date): void {
        if (this.state.usedAt !== null) {
            throw new AccessError(
                'ACCESS_CODE_ALREADY_USED',
                'Access code was already used',
            );
        }
        this.state = { ...this.state, usedAt: now };
    }
}

const code = AccessCodeEntity.issue({
    id: this._ids.next(),
    unitId,
    now: this._clock.now(),
});
```

## Когда нужны entity и репозиторий

Только если у сущности есть переходы состояний, правила, общие для всех операций,
или необратимые последствия. Без этого — Prisma прямо в сервисе через выборки.
Чтение для экранов и списков идёт выборками, мимо репозитория, даже в модуле с entity.

## Сервисы

Сервис — на тему, а не один на модуль: `resident-access.service.ts`,
`resident-import.service.ts`. Сервис, в котором сошлись две темы, делится.

## Группировка внутри слоя

- Вложенность — не глубже одной папки.
- `domain/` делится по предметам, `infrastructure/` — по технологиям (`prisma/`, `sms/`), `presentation/` — `dto/`.
- Папка появляется, когда в слое больше шести файлов.

## Проверяется автоматически

oxlint: направления из таблицы на двух уровнях вложенности; `domain/` и `ports/` без Nest и Prisma.

## Не проверяется

- Правило, которое утекло из entity в сервис; entity, которая сама берёт время или id.
- Entity, заведённая для простой сущности; чтение для экрана через репозиторий.
- Сервис на несколько тем; вложенность глубже одной папки.
