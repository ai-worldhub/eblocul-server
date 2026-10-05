import { LabSeed } from '../../src/shared/seeding/lab-seed.ts';

export class SeedJournal {
    readonly applied: string[] = [];
}

abstract class RecordingSeedDouble extends LabSeed {
    constructor(private readonly _journal: SeedJournal) {
        super();
    }

    run(): Promise<void> {
        this._journal.applied.push(this.name);
        return Promise.resolve();
    }
}

export class FirstSeedDouble extends RecordingSeedDouble {
    readonly name = 'probe.first';
}

export class SecondSeedDouble extends RecordingSeedDouble {
    readonly name = 'probe.second';
}

export class SameNameSeedDouble extends RecordingSeedDouble {
    readonly name = 'probe.first';
}

export class FailingSeedDouble extends LabSeed {
    readonly name = 'probe.failing';

    run(): Promise<void> {
        return Promise.reject(new Error('Seed double refuses to run'));
    }
}
