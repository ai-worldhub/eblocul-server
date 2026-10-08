export const EMAIL_MAX_LENGTH = 254;

export const normalizeEmail = (email: string): string =>
    email.trim().toLowerCase();
