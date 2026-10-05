import {
    REDACTED,
    redactSecrets,
} from '../../../src/shared/logging/secrets.ts';
import { expectNoSecrets } from '../../utils/no-secrets.ts';

describe('app-secrets', () => {
    it('masks secret field names at any depth and keeps the rest', () => {
        const at = new Date('2026-09-16T08:00:00Z');

        expect(
            redactSecrets({
                userId: 'user-1',
                tokenCount: 3,
                at,
                items: [{ accessToken: 'a', id: 'x' }],
                auth: {
                    Authorization: 'Bearer a',
                    apiKey: 'k',
                    emailSalt: 's',
                },
                storage: {
                    accessKeyId: 'AKIA0000',
                    S3_UPLOAD_PRESIGNER_ACCESS_KEY_ID: 'AKIA0000',
                    region: 'eu-central-1',
                },
            }),
        ).toEqual({
            userId: 'user-1',
            tokenCount: 3,
            at,
            items: [{ accessToken: REDACTED, id: 'x' }],
            auth: {
                Authorization: REDACTED,
                apiKey: REDACTED,
                emailSalt: REDACTED,
            },
            storage: {
                accessKeyId: REDACTED,
                S3_UPLOAD_PRESIGNER_ACCESS_KEY_ID: REDACTED,
                region: 'eu-central-1',
            },
        });
    });

    it('hides subtrees too deep to inspect', () => {
        type Nested = { level: Nested } | { password: string };
        let deep: Nested = { password: 'deep-secret' };
        for (let level = 0; level < 12; level += 1) {
            deep = { level: deep };
        }

        expect(JSON.stringify(redactSecrets({ deep }))).not.toContain(
            'deep-secret',
        );
        expect(
            JSON.stringify(redactSecrets({ list: [[[[[[[[[[['x']]]]]]]]]]] })),
        ).toContain(REDACTED);
    });

    it('accepts a clean body', () => {
        expectNoSecrets({ id: 'doc-1', items: [{ name: 'Blood test' }] });
    });

    it.each([
        ['a secret field name', { user: { passwordHash: 'x' } }],
        ['a JWT', { note: 'eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl' }],
        [
            'an S3 address',
            { url: 'https://bucket.s3.eu-central-1.amazonaws.com/key' },
        ],
        [
            'a presigned URL',
            { url: 'https://files.example/key?X-Amz-Signature=abc' },
        ],
        [
            'an AWS ARN',
            {
                storage:
                    'arn:aws:s3:eu-central-1:000000000000:accesspoint/ingress',
            },
        ],
        ['a password hash', { value: '$argon2id$v=19$m=65536' }],
        ['a database URL', { details: 'postgresql://u:p@db:5432/app' }],
    ])('rejects %s', (_name, body) => {
        expect(() => expectNoSecrets(body)).toThrow();
    });

    it('rejects environment values and skips allowed keys', () => {
        expect(() =>
            expectNoSecrets(
                { path: 'eblocul-media/u1' },
                { values: ['eblocul-media'] },
            ),
        ).toThrow();
        expectNoSecrets(
            {
                accessToken: 'eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl',
                expiresIn: 900,
            },
            { allowKeys: ['accessToken'] },
        );
    });
});
