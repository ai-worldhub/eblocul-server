import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseOriginList } from '../../../../shared/configs/env.validation.ts';

@Injectable()
export class TrustedOrigins {
    private readonly _origins: ReadonlySet<string>;

    constructor(config: ConfigService) {
        this._origins = new Set(
            parseOriginList(config.getOrThrow<string>('WEB_PANEL_ORIGINS')),
        );
    }

    has(origin: string | undefined): boolean {
        return origin !== undefined && this._origins.has(origin);
    }
}
