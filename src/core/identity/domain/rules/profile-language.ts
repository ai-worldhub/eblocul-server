export const PROFILE_LANGUAGES = ['ro', 'ru'] as const;

export type ProfileLanguage = (typeof PROFILE_LANGUAGES)[number];
