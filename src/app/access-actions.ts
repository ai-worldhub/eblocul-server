import type { AccessAction } from '../core/authz/index.ts';
import { JOURNAL_READ_ENTRIES } from '../core/journal/index.ts';

export const ACCESS_ACTIONS: readonly AccessAction[] = [JOURNAL_READ_ENTRIES];
