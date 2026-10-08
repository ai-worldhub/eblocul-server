const LOCK_MINUTES = 15;
const MINUTE_SECONDS = 60;

export const ADMIN_PASSWORD_ATTEMPTS = {
    name: 'identity.admin_password',
    maxFailures: 5,
    lockSeconds: LOCK_MINUTES * MINUTE_SECONDS,
    forgetAfterSeconds: LOCK_MINUTES * MINUTE_SECONDS,
} as const;
