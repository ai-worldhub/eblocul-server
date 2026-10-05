import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service.ts';

@Global()
@Module({
    providers: [DbService],
    exports: [DbService],
})
export class DbModule {}
