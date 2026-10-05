import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service.ts';
import { Transactions } from './transactions.service.ts';

@Global()
@Module({
    providers: [DbService, Transactions],
    exports: [DbService, Transactions],
})
export class DbModule {}
