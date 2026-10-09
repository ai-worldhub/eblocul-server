export { AuthzModule } from './authz.module.ts';
export { AccessService } from './application/services/access.service.ts';
export type { Access as AccessContext } from './domain/entities/access.ts';
export type { AccessScope } from './domain/entities/access-scope.ts';
export type { TargetReference } from './domain/entities/access-target.ts';
export {
    type AccessAction,
    type ActionGrants,
    type ActionKind,
    defineAction,
} from './domain/rules/access-action.ts';
export type { AccessRole } from './domain/rules/access-roles.ts';
export {
    scopeCondition,
    type ScopeColumns,
    scopeWhere,
    type ScopeWhere,
} from './infrastructure/prisma/scope-condition.ts';
export { AUTHZ_ERROR_STATUSES } from './presentation/authz.error-statuses.ts';
export {
    Access,
    ACCESS_GRANT_HEADER,
} from './presentation/decorators/access.decorator.ts';
export { CurrentAccess } from './presentation/decorators/current-access.decorator.ts';
