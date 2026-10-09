import { AUTHZ_ERROR_STATUSES } from '../core/authz/index.ts';
import { IDENTITY_ERROR_STATUSES } from '../core/identity/index.ts';
import { JOURNAL_ERROR_STATUSES } from '../core/journal/index.ts';
import { THROTTLE_ERROR_STATUSES } from '../core/throttle/index.ts';
import type { ErrorStatuses } from '../shared/http/exception.filter.ts';
import { PAGINATION_ERROR_STATUSES } from '../shared/http/pagination.ts';

export const ERROR_STATUSES: ErrorStatuses = {
    ...PAGINATION_ERROR_STATUSES,
    ...IDENTITY_ERROR_STATUSES,
    ...THROTTLE_ERROR_STATUSES,
    ...AUTHZ_ERROR_STATUSES,
    ...JOURNAL_ERROR_STATUSES,
};
