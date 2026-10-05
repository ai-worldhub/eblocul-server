import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Health } from './health.dto.ts';

@ApiTags('health')
@Controller('health')
export class HealthController {
    @Get()
    @ApiOperation({ summary: 'Answer that the application is up' })
    @ApiOkResponse({ type: Health.StatusResponse })
    check(): Health.StatusResponse {
        return { status: 'ok' };
    }
}
