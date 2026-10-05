---
paths:
    - 'src/*/*/ports/**'
    - 'src/*/*/infrastructure/**'
    - 'src/*/*/*.module.ts'
    - 'src/**/*.handler.ts'
    - 'src/app/app-ports.module.ts'
    - 'src/app/job-handlers.ts'
---

# Порты

Порт — абстрактный класс, через который модуль обращается наружу: к базе, к внешнему
сервису, к другому модулю. Сценарии зависят от порта, а не от того, что за ним стоит.

## Где лежат

```
<модуль>/
  ports/             только абстрактные классы и типы их сигнатур
  infrastructure/    реализации портов
```

В `domain/` абстрактных классов для DI нет: там только entity, правила и ошибки.

## Виды портов

| Вид                  | Что это                                                   | Файл порта                      | Реализация                     | Где связан                |
| -------------------- | --------------------------------------------------------- | ------------------------------- | ------------------------------ | ------------------------- |
| Хранилище            | загрузка и сохранение entity                              | `ports/<предмет>.repository.ts` | `infrastructure/prisma/`       | `<модуль>.module.ts`      |
| Внешний порт         | вне процесса или зависит от окружения: провайдер SMS, хэш | `ports/<что>.port.ts`           | `infrastructure/<технология>/` | `<модуль>.module.ts`      |
| Обратная зависимость | двум модулям ядра нужен друг друга                        | `ports/` потребителя            | `infrastructure/` поставщика   | `app/app-ports.module.ts` |

`Clock` и `Ids` — порты общего назначения, поэтому лежат в `shared/`.

## Правила порта

- В файле один абстрактный класс и типы его сигнатур. Реализаций, констант и логики нет.
- Метод назван по тому, что нужно сценарию, а не по технологии: `send(phone, text)`, а не `postToProviderApi`.
- Порт импортирует `domain/` своего модуля, `shared/` и `index.ts` модулей ядра — типы для сигнатур, например `Tx` из `shared/db/tx.ts`. Nest, Prisma и `generated/` в нём нет.
- У хранилища `tx` — первый параметр каждого метода.
- Класс назван по роли: `TicketRepository`, `PasswordHasher`, `SmsSender`.

```ts
export abstract class TicketRepository {
    abstract lockById(tx: Tx, ticketId: string): Promise<TicketEntity>;
    abstract save(tx: Tx, ticket: TicketEntity): Promise<void>;
}
```

## Реализация

- Имя — технология и роль: `PrismaTicketRepository`, `ArgonPasswordHasher`.
- Только реализация знает библиотеку или провайдера. Сменить технологию — заменить один файл и строку в модуле.
- Связь — в файле модуля: `{ provide: TicketRepository, useClass: PrismaTicketRepository }`.

## Обработчики заданий

- Задание принадлежит модулю, чья это работа. Его имя и поля объявлены в `application/<модуль>.jobs.ts`, обработчик — класс в `application/handlers/<задание>.handler.ts`.
- Обработчик открыт через `index.ts` и внесён в общий список `src/app/job-handlers.ts`.
- Механизм вводится вместе с модулем `jobs`; тогда же появится тест, что каждый `*.handler.ts` есть в списке.
- В списке только импорты и массив классов. Ядро `jobs` имён чужих заданий не знает.

## Обратная зависимость

`src/app/app-ports.module.ts` содержит только строки `{ provide: Порт, useExisting: Адаптер }`.
Функций и логики в нём нет. `forwardRef` не используется.

## В тестах

Двойник реализует порт и лежит в `test/utils/<что>.double.ts`. Подмена —
`useTestApp((builder) => builder.overrideProvider(SmsSender).useValue(double))`.

## Проверяется автоматически

- oxlint: `ports/` импортирует только `domain/`, `shared/` и `index.ts` ядра, без Nest, Prisma и `generated/`;
  `infrastructure/` не импортирует `application/`; `presentation/` и `domain/` не импортируют `ports/`.
- Nest при старте: у каждого порта есть реализация.

## Не проверяется

- Абстрактный класс для DI в `domain/`; реализация или логика в файле порта.
- Логика в `app-ports.module.ts` и `job-handlers.ts`; обработчик, забытый в списке.
- Имя метода порта, которое выдаёт технологию.
