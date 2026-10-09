import {
    type ExecutionContext,
    Inject,
    Injectable,
    type OnApplicationBootstrap,
    RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../../../../shared/http/public.decorator.ts';
import { IS_SESSION_ONLY } from '../../../../shared/http/session-only.decorator.ts';
import { AuthzError } from '../../domain/authz.errors.ts';
import type {
    AccessAction,
    ActionKind,
} from '../../domain/rules/access-action.ts';
import {
    ACCESS_MARK,
    type AccessMark,
} from '../decorators/access.decorator.ts';

export const ACCESS_ACTIONS = Symbol('ACCESS_ACTIONS');

type Handler = ReturnType<ExecutionContext['getHandler']>;
type Controller = ReturnType<ExecutionContext['getClass']>;

type Endpoint = {
    controller: Controller;
    handler: Handler;
    method: RequestMethod;
};

const READING_METHODS: readonly RequestMethod[] = [
    RequestMethod.GET,
    RequestMethod.HEAD,
];
const UNDECIDED_METHODS: readonly RequestMethod[] = [
    RequestMethod.ALL,
    RequestMethod.OPTIONS,
];

const pathsOf = (target: Handler | Controller): string[] => {
    const path: unknown = Reflect.getMetadata(PATH_METADATA, target);
    return (Array.isArray(path) ? path : [path]).filter(
        (part): part is string => typeof part === 'string',
    );
};

const paramOf = (mark: AccessMark): string | null => {
    if (mark.target === null) {
        return null;
    }
    return 'node' in mark.target ? mark.target.node : mark.target.unit;
};

@Injectable()
export class AccessMarks implements OnApplicationBootstrap {
    constructor(
        private readonly _reflector: Reflector,
        private readonly _discovery: DiscoveryService,
        private readonly _scanner: MetadataScanner,
        @Inject(ACCESS_ACTIONS)
        private readonly _actions: readonly AccessAction[],
    ) {}

    onApplicationBootstrap(): void {
        this._assertUniqueNames();
        for (const endpoint of this._endpoints()) {
            this._assertMarked(endpoint);
        }
    }

    private _endpoints(): Endpoint[] {
        return this._discovery.getControllers().flatMap(({ instance }) => {
            const controller: unknown = instance;
            if (typeof controller !== 'object' || controller === null) {
                return [];
            }
            const prototype = Object.getPrototypeOf(controller) as Record<
                string,
                Handler | undefined
            >;
            return this._scanner
                .getAllMethodNames(prototype)
                .flatMap((name) => {
                    const handler = prototype[name];
                    const method: unknown =
                        handler === undefined
                            ? undefined
                            : Reflect.getMetadata(METHOD_METADATA, handler);
                    return handler === undefined || typeof method !== 'number'
                        ? []
                        : [
                              {
                                  controller:
                                      controller.constructor as Controller,
                                  handler,
                                  method,
                              },
                          ];
                });
        });
    }

    private _assertUniqueNames(): void {
        const names = this._actions.map((action) => action.name);
        const repeated = names.find(
            (name, index) => names.indexOf(name) !== index,
        );
        if (repeated !== undefined) {
            throw new AuthzError(
                'AUTHZ_ACTION_INVALID',
                'Two actions carry the same name',
                { action: repeated },
            );
        }
    }

    private _assertMarked(endpoint: Endpoint): void {
        const targets = [endpoint.handler, endpoint.controller];
        const isMarked = (key: string): boolean =>
            this._reflector.getAllAndOverride<boolean | undefined>(
                key,
                targets,
            ) === true;
        const mark = this._reflector.get<AccessMark | undefined>(
            ACCESS_MARK,
            endpoint.handler,
        );
        const marks = [
            isMarked(IS_PUBLIC),
            isMarked(IS_SESSION_ONLY),
            mark !== undefined,
        ].filter((isSet) => isSet).length;
        if (marks !== 1) {
            throw this._invalid(
                endpoint,
                'An endpoint carries exactly one of @Public(), @SessionOnly() and @Access()',
            );
        }
        if (mark !== undefined) {
            this._assertAccessMark(endpoint, mark);
        }
    }

    private _assertAccessMark(endpoint: Endpoint, mark: AccessMark): void {
        if (!this._actions.includes(mark.action)) {
            throw this._invalid(
                endpoint,
                'The action of @Access() is not in the list of access actions',
            );
        }
        const kind: ActionKind = READING_METHODS.includes(endpoint.method)
            ? 'read'
            : 'change';
        if (
            UNDECIDED_METHODS.includes(endpoint.method) ||
            kind !== mark.action.kind
        ) {
            throw this._invalid(
                endpoint,
                'A reading action stands on GET and a changing action on a changing method',
            );
        }
        const param = paramOf(mark);
        const route = [
            ...pathsOf(endpoint.controller),
            ...pathsOf(endpoint.handler),
        ].join('/');
        if (param !== null && !route.split('/').includes(`:${param}`)) {
            throw this._invalid(
                endpoint,
                'The target of @Access() names a parameter the route does not have',
            );
        }
    }

    private _invalid(endpoint: Endpoint, reason: string): AuthzError {
        return new AuthzError('AUTHZ_ACCESS_MARK_INVALID', reason, {
            controller: endpoint.controller.name,
            handler: endpoint.handler.name,
        });
    }
}
