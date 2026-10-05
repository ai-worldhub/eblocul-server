import { ApiProperty, ApiSchema } from '@nestjs/swagger';

export namespace Health {
    @ApiSchema({ name: 'Health-StatusResponse' })
    export class StatusResponse {
        @ApiProperty({ example: 'ok' })
        status: string;
    }
}
