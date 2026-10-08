import {
    type ExecutionContext,
    Injectable,
    type OnApplicationBootstrap,
} from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC } from '../../../../shared/http/public.decorator.ts';
import {
    NO_RATE_LIMIT,
    RATE_LIMIT,
    type RateLimitMark,
} from '../../../../shared/http/rate-limit.decorator.ts';
import {
    defineRateLimit,
    PUBLIC_RATE_LIMIT,
    type RateLimit,
} from '../../domain/rules/rate-limit.ts';
import { ThrottleError } from '../../domain/throttle.errors.ts';

type Handler = ReturnType<ExecutionContext['getHandler']>;
type Controller = ReturnType<ExecutionContext['getClass']>;

@Injectable()
export class RateLimitMarks implements OnApplicationBootstrap {
    constructor(
        private readonly _reflector: Reflector,
        private readonly _discovery: DiscoveryService,
        private readonly _scanner: MetadataScanner,
    ) {}

    onApplicationBootstrap(): void {
        const groups = new Map<string, RateLimit>([
            [PUBLIC_RATE_LIMIT.group, PUBLIC_RATE_LIMIT],
        ]);
        for (const { instance } of this._discovery.getControllers()) {
            const controller: unknown = instance;
            if (typeof controller !== 'object' || controller === null) {
                continue;
            }
            const prototype = Object.getPrototypeOf(controller) as Record<
                string,
                Handler
            >;
            for (const name of this._scanner.getAllMethodNames(prototype)) {
                const handler = prototype[name];
                const limit =
                    handler === undefined
                        ? null
                        : this.limitOf(
                              handler,
                              controller.constructor as Controller,
                          );
                if (limit !== null) {
                    this._assertSameAsGroup(groups, limit);
                }
            }
        }
    }

    limitOf(handler: Handler, controller: Controller): RateLimit | null {
        const targets = [handler, controller];
        const mark = this._reflector.getAllAndOverride<
            RateLimitMark | undefined
        >(RATE_LIMIT, targets);
        if (mark === NO_RATE_LIMIT) {
            return null;
        }
        if (mark !== undefined) {
            return defineRateLimit(mark);
        }
        const isPublic =
            this._reflector.getAllAndOverride<boolean | undefined>(
                IS_PUBLIC,
                targets,
            ) === true;
        return isPublic ? PUBLIC_RATE_LIMIT : null;
    }

    private _assertSameAsGroup(
        groups: Map<string, RateLimit>,
        limit: RateLimit,
    ): void {
        const known = groups.get(limit.group);
        if (
            known !== undefined &&
            (known.burst !== limit.burst ||
                known.intervalMs !== limit.intervalMs)
        ) {
            throw new ThrottleError(
                'THROTTLE_RULE_INVALID',
                'Endpoints of one rate limit group must carry the same burst and refill time',
                { group: limit.group },
            );
        }
        groups.set(limit.group, limit);
    }
}
