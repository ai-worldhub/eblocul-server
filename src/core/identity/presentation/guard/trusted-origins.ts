import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SEPARATOR = ',';

@Injectable()
export class TrustedOrigins {
    private readonly _origins: ReadonlySet<string>;

    constructor(config: ConfigService) {
        this._origins = new Set(
            config
                .getOrThrow<string>('WEB_PANEL_ORIGINS')
                .split(SEPARATOR)
                .filter((origin) => origin !== ''),
        );
    }

    has(origin: string | undefined): boolean {
        return origin !== undefined && this._origins.has(origin);
    }
}
