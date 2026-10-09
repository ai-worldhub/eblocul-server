import type { Response, Test } from 'supertest';
import { VerificationCodeSender } from '../../src/core/identity/ports/verification-code-sender.port.ts';
import { VerificationCodeSource } from '../../src/core/identity/ports/verification-code-source.port.ts';
import { responseBody } from './response-body.ts';
import type { TestApp, TestAppOverrides } from './test-app.factory.ts';
import {
    VerificationCodeSenderDouble,
    VerificationCodeSourceDouble,
} from './verification-code.double.ts';

export const CODES_PATH = '/api/v1/auth/resident-app/codes';
const RESIDENT_LOGIN_PATH = '/api/v1/auth/resident-app/login';
export const REGISTRATION_PATH = '/api/v1/auth/resident-app/registration';
export const CONSENT_PATH = '/api/v1/auth/resident-app/consent';
export const CONSENT_VERSION = 'e2e-version-1';

export const RESIDENT = {
    firstName: 'Ion',
    lastName: 'Popescu',
    phone: '+37369000001',
    writtenPhone: '069 000 001',
} as const;

const TOKEN_KEYS = ['token'] as const;

type Http = Pick<TestApp, 'http'>;

export type SessionBody = {
    token: string;
    accountId: string;
    application: string;
};

type PendingBody = {
    token: string;
    expiresInSeconds: number;
    consentVersion: string;
};

export type LoginBody = {
    outcome: string;
    session: SessionBody | null;
    pending: PendingBody | null;
};

export type CodeDoubles = {
    source: VerificationCodeSourceDouble;
    sender: VerificationCodeSenderDouble;
    override: TestAppOverrides;
    reset: () => void;
};

export const codeDoubles = (): CodeDoubles => {
    const source = new VerificationCodeSourceDouble();
    const sender = new VerificationCodeSenderDouble();
    return {
        source,
        sender,
        override: (builder) =>
            builder
                .overrideProvider(VerificationCodeSource)
                .useValue(source)
                .overrideProvider(VerificationCodeSender)
                .useValue(sender),
        reset: () => {
            source.reset();
            sender.clear();
        },
    };
};

export const bearer = (token: string): string => `Bearer ${token}`;

export const requestCode = (testApp: Http, phone: string): Test =>
    testApp.http().post(CODES_PATH).send({ phone });

export const confirmCode = (testApp: Http, phone: string, code: string): Test =>
    testApp.http().post(RESIDENT_LOGIN_PATH).send({ phone, code });

export const loginBodyOf = (response: Response): LoginBody =>
    responseBody<LoginBody>(response, { allowKeys: TOKEN_KEYS });

export const sessionBodyOf = (response: Response): SessionBody =>
    responseBody<{ session: SessionBody }>(response, { allowKeys: TOKEN_KEYS })
        .session;

export const confirmSentCode = async (
    testApp: Http,
    doubles: CodeDoubles,
    phone: string,
): Promise<LoginBody> => {
    await requestCode(testApp, phone).expect(200);
    const sent = doubles.sender.sent().at(-1);
    if (sent === undefined) {
        throw new Error('No code was sent');
    }
    return loginBodyOf(
        await confirmCode(testApp, phone, sent.code).expect(200),
    );
};

export const registerResident = async (
    testApp: Http,
    doubles: CodeDoubles,
    resident: {
        firstName: string;
        lastName: string;
        writtenPhone: string;
    } = RESIDENT,
): Promise<SessionBody> => {
    const { pending } = await confirmSentCode(
        testApp,
        doubles,
        resident.writtenPhone,
    );
    const response = await testApp
        .http()
        .post(REGISTRATION_PATH)
        .send({
            pendingToken: pending?.token ?? '',
            consentVersion: pending?.consentVersion ?? '',
            firstName: resident.firstName,
            lastName: resident.lastName,
        })
        .expect(201);
    return sessionBodyOf(response);
};
