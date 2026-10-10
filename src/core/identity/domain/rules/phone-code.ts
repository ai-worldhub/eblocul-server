const MINUTE_SECONDS = 60;
const LOCK_MINUTES = 15;

export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^\d{6}$/;
export const CODE_LIFETIME_SECONDS = 10 * MINUTE_SECONDS;
export const CODE_RESEND_SECONDS = MINUTE_SECONDS;
export const PENDING_LIFETIME_SECONDS = 30 * MINUTE_SECONDS;

export const RESIDENT_CODE_ATTEMPTS = {
    name: 'identity.resident_code',
    maxFailures: 5,
    lockSeconds: LOCK_MINUTES * MINUTE_SECONDS,
    forgetAfterSeconds: LOCK_MINUTES * MINUTE_SECONDS,
} as const;

export const RESIDENT_CODE_RESEND = {
    group: 'identity_resident_code_resend',
    burst: 1,
    refillSeconds: CODE_RESEND_SECONDS,
} as const;

export type CodeOutcome =
    'signed_in' | 'registration_required' | 'consent_required';
