import type { Prisma } from '../../src/generated/prisma/client.ts';
import { defineFactory } from './define-factory.ts';

const CREATED_AT = new Date('2026-10-01T09:00:00.000Z');
const ID_PREFIX = '00000000-0000-7000-8000-';
const ID_TAIL_LENGTH = 12;
const PHONE_PREFIX = '+3736900';
const PHONE_TAIL_LENGTH = 4;

export const accountRow = defineFactory<Prisma.AccountCreateManyInput>(
    (sequence) => ({
        id: `${ID_PREFIX}${String(sequence).padStart(ID_TAIL_LENGTH, '0')}`,
        firstName: 'Test',
        lastName: `Person ${sequence}`,
        phone: `${PHONE_PREFIX}${String(sequence).padStart(PHONE_TAIL_LENGTH, '0')}`,
        email: null,
        createdAt: CREATED_AT,
        phoneVerifiedAt: null,
    }),
);

export const OUTDATED_PASSWORD = {
    password: 'correct-horse-42',
    hash: '$argon2id$v=19$m=8,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$kzRi7AQ2CHfrz9ED4+OLhQHOuaPofhEkjxK+UJHw/kA',
} as const;
