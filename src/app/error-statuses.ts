import type { ErrorStatuses } from '../shared/http/exception.filter.ts';
import { PAGINATION_ERROR_STATUSES } from '../shared/http/pagination.ts';

export const ERROR_STATUSES: ErrorStatuses = {
    ...PAGINATION_ERROR_STATUSES,
};
