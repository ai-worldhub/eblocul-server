import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import type { SessionApplication } from '../../domain/entities/session.entity.ts';

const APPLICATIONS = [
    'admin_panel',
    'guard_panel',
    'resident_app',
] as const satisfies readonly SessionApplication[];

export namespace Session {
    @ApiSchema({ name: 'Session-Current' })
    export class Current {
        @ApiProperty({ example: '0192f0c1-7b3a-7c11-9a41-2f6d3c8e5b10' })
        accountId: string;

        @ApiProperty({ enum: APPLICATIONS, example: 'admin_panel' })
        application: SessionApplication;
    }
}
