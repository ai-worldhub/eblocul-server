import {
    type CanActivate,
    type ExecutionContext,
    Injectable,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { RateLimitService } from '../../application/services/rate-limit.service.ts';
import { clientAddressKey } from '../../domain/rules/client-address.ts';
import { RateLimitMarks } from './rate-limit-marks.ts';

type AddressedRequest = IncomingMessage & { ip?: string };

@Injectable()
export class RateLimitGuard implements CanActivate {
    constructor(
        private readonly _marks: RateLimitMarks,
        private readonly _limits: RateLimitService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') {
            return true;
        }
        const limit = this._marks.limitOf(
            context.getHandler(),
            context.getClass(),
        );
        if (limit !== null) {
            const request = context
                .switchToHttp()
                .getRequest<AddressedRequest>();
            await this._limits.spend(limit, clientAddressKey(request.ip));
        }
        return true;
    }
}
