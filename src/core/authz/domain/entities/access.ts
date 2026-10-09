import type { AccessAction } from '../rules/access-action.ts';
import type { AccessRole, Application } from '../rules/access-roles.ts';
import type { AccessScope } from './access-scope.ts';
import type { TargetReference } from './access-target.ts';

export type Access = {
    readonly accountId: string;
    readonly application: Application;
    readonly grantId: string;
    readonly role: AccessRole;
    readonly unitId: string | null;
    readonly action: AccessAction;
    readonly target: TargetReference | null;
    readonly scope: AccessScope;
};
