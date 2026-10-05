import { Injectable } from '@nestjs/common';
import { v7 as uuidV7 } from 'uuid';

export abstract class Ids {
    abstract next(): string;
}

@Injectable()
export class UuidV7Ids implements Ids {
    next(): string {
        return uuidV7();
    }
}
