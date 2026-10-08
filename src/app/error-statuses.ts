import { IDENTITY_ERROR_STATUSES } from '../core/identity/index.ts';
import { THROTTLE_ERROR_STATUSES } from '../core/throttle/index.ts';
import type { ErrorStatuses } from '../shared/http/exception.filter.ts';
import { PAGINATION_ERROR_STATUSES } from '../shared/http/pagination.ts';

export const ERROR_STATUSES: ErrorStatuses = {
    ...PAGINATION_ERROR_STATUSES,
    ...IDENTITY_ERROR_STATUSES,
    ...THROTTLE_ERROR_STATUSES,
};
