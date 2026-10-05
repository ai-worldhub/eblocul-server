import type { ErrorStatuses } from '../shared/http/exception.filter.ts';
import { PaginationErrorStatuses } from '../shared/http/pagination.ts';

export const errorStatuses: ErrorStatuses = {
    ...PaginationErrorStatuses,
};
