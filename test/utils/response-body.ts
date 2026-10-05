import type { Response } from 'supertest';
import { expectNoSecrets, type SecretCheckOptions } from './no-secrets.ts';

export const responseBody = <TBody>(
    response: Response,
    options?: SecretCheckOptions,
): TBody => {
    expectNoSecrets(response.body, options);
    return response.body as TBody;
};
