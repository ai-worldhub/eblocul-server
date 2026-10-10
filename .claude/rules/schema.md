---
paths:
    - 'prisma/schema/**'
---

# Схема базы

## Имена

| Что           | В схеме Prisma                    | В базе                             |
| ------------- | --------------------------------- | ---------------------------------- |
| Модель        | `Ticket` — единственное число     | `tickets` — `@@map`, множественное |
| Поле          | `createdAt` — camelCase           | `created_at` — `@map`              |
| Enum          | `TicketState`                     | `ticket_state` — `@@map`           |
| Значение enum | `in_progress` — нижний snake_case | то же                              |
| Ключ связи    | `<сущность>Id`: `unitId`          | `unit_id`                          |
| Время         | оканчивается на `At`: `closedAt`  | `closed_at`                        |
| Логическое    | `is…` или `has…`                  | `is_pinned`                        |

У каждой модели есть `@@map`, у каждого поля из двух слов — `@map`. Сырой SQL пишется без кавычек.

## Схема PostgreSQL

- У каждого модуля своя схема PostgreSQL. Её имя совпадает с именем файла `prisma/schema/<модуль>.prisma`.
- У каждой модели и каждого enum стоит `@@schema("<модуль>")` — последней строкой, после `@@map`.
- Новая схема вносится в список `schemas` в `prisma/schema/base.prisma`.
- В `public` моделей нет: список `PUBLIC_SCHEMA_FILES` теста соглашений пуст.
- В сыром SQL таблица и тип названы вместе со схемой: `jobs.jobs`, `jobs.job_class`.

## Типы

- **Id** — `String @id @db.Uuid`, без `@default`. Значение приходит из `Ids`, а у сущности, которую создаёт клиент, — из запроса.
- **Время** — `DateTime @db.Timestamptz(3)`. Без `@default(now())` и без `@updatedAt`: время приходит из `Clock`.
- **Деньги** — целое число в минимальных единицах, единица в имени: `amountBani Int`. `Float` не используется.
- **Набор значений** — `enum`, а не строка и не пара логических полей.
  Исключение — значение, которое объявляют модули: вид задания, тип действия журнала. Оно хранится строкой `<модуль>.<имя>`:
  enum базы требовал бы миграции чужого модуля на каждое новое значение.
- **`Json`** — только для данных, которые база не фильтрует и не соединяет: поля задания, параметры записи журнала.

## «Значения нет»

- Поле необязательное (`?`), только когда отсутствие значения — настоящее состояние: `closedAt DateTime?`.
- Пустая строка вместо `null` не хранится. Логическое поле необязательным не бывает.

## Связи

- Внешний ключ — внутри модуля и в сторону ядра; правила — в `modules.md`.
- `onDelete` указан всегда. `Cascade` — только для частей одной entity, которые не живут без неё. Во всех остальных случаях `Restrict`.
- У каждой колонки внешнего ключа есть индекс, в котором она стоит первой.

## Индексы и ограничения

- Список — индекс по полям фильтра и сортировки: `@@index([unitId, createdAt, id])`.
- Уникальность — `@@unique` в схеме.
- Частичный уникальный индекс, ограничение-исключение и триггер Prisma описать не умеет.
  Они пишутся руками в SQL миграции, а над моделью стоит строка с их именами.
  Колонки такого индекса в `@@unique` и `@@index` не повторяются: условие Prisma не видит
  и предложит только переименовать индекс. Так держится ключ задания: `jobs_live_kind_dedup_key_key`.

## Порядок в модели

Id, ключи связей, данные, время; пустая строка; связи; пустая строка; `@@index`, `@@unique`, `@@map`, `@@schema`.

```prisma
enum TicketState {
  open
  in_progress
  closed

  @@map("ticket_state")
  @@schema("tickets")
}

model Ticket {
  id        String      @id @db.Uuid
  unitId    String      @map("unit_id") @db.Uuid
  state     TicketState
  title     String
  createdAt DateTime    @map("created_at") @db.Timestamptz(3)
  closedAt  DateTime?   @map("closed_at") @db.Timestamptz(3)

  unit     Unit            @relation(fields: [unitId], references: [id], onDelete: Restrict)
  comments TicketComment[]

  @@index([unitId, createdAt, id])
  @@map("tickets")
  @@schema("tickets")
}
```

## Данные дома

Таблица с данными дома — объявления, сообщения, заявки, записи журнала — хранит два поля (`docs/decisions.md`, Р-4):

- `complexId` — корень комплекса;
- `ownerNodeId` — узел, на котором данные созданы.

Оба поля — `String @db.Uuid` с внешним ключом на узел модуля `structure` и `onDelete: Restrict`.
Область видимости накладывается условием по этим полям в самом запросе, а не проверкой после выборки.
Узлы не переезжают, поэтому `complexId` строки не меняется.

```prisma
model Announcement {
  id          String @id @db.Uuid
  complexId   String @map("complex_id") @db.Uuid
  ownerNodeId String @map("owner_node_id") @db.Uuid

  complex   Node @relation("AnnouncementComplex", fields: [complexId], references: [id], onDelete: Restrict)
  ownerNode Node @relation("AnnouncementOwnerNode", fields: [ownerNodeId], references: [id], onDelete: Restrict)

  @@index([complexId, ownerNodeId])
  @@index([ownerNodeId])
  @@map("announcements")
  @@schema("announcements")
}
```

У таблиц самого дерева поля свои: у узла — `complexId`, у объекта — `complexId` и `nodeId`.
Аккаунты, сессии и задания данными дома не являются: этих полей у них нет.

## Таблица, которая только пополняется

Запись журнала действий не изменяется и не удаляется (`docs/decisions.md`, Р-7).

- Таблицу держат два триггера, написанные руками в SQL миграции: на оператор (`UPDATE`, `DELETE`, `TRUNCATE`) и на строку (`UPDATE`, `DELETE`).
  Их имена стоят строкой над моделью.
- Снять триггер, выключить его или обойти — в коде и в миграции — вопрос владельцу проекта.
- В `src/` нет ни одного изменяющего обращения к такой таблице.
- На такую таблицу ссылаться можно, удалить строку, на которую ссылается она, нельзя: её внешние ключи — `Restrict`.
  Аккаунт, узел и объект, названные в журнале, не удаляются, пока журнал дома существует.

## Проверяется автоматически

- `test/e2e/journal/journal-immutability.e2e-spec.ts`: изменить и удалить запись журнала нельзя ни через Prisma, ни сырым SQL.
- `test/unit/journal/append-only-code.spec.ts`: в `src/` нет изменяющих обращений к журналу. Проверка идёт по тексту кода.
- `test/unit/modules/house-data-scope.spec.ts`: чтение таблицы с `complexId` и `ownerNodeId` ставит область видимости.
  SQL проверяется по строке запроса, обращение через Prisma — по файлу, а не по вызову.
- `test/unit/schema/schema-conventions.spec.ts` читает файлы схемы:
    - у модели и enum есть `@@map` в snake_case, у поля из двух слов — `@map`;
    - у модели и enum есть `@@schema` с именем файла схемы; для файлов из `PUBLIC_SCHEMA_FILES` — `public`;
    - значения enum в нижнем snake_case;
    - id — `@db.Uuid` без `@default`;
    - у `DateTime` стоит `@db.Timestamptz`, нет `@default(now())` и `@updatedAt`;
    - нет `Float`;
    - у связи указан `onDelete`, а колонка внешнего ключа стоит первой в каком-нибудь индексе.
- `tsc`: создание записи без `id` или без времени не компилируется — значения по умолчанию нет.
- CI: схема совпадает с миграциями.
- Тест владения: модель вызывается только из своего модуля.

## Не проверяется

- Множественное число в имени таблицы; имена полей (`…At`, `is…`, `<сущность>Id`).
- Необязательное поле без причины; `Json` для данных, которые фильтруются.
- `Cascade` там, где нужен `Restrict`.
- Ограничения, написанные руками в SQL миграции, и строка с их именами над моделью.
- Имя схемы в сыром SQL.
- Таблица с данными дома без `complexId` и `ownerNodeId`.
