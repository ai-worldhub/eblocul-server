export abstract class LabSeed {
    abstract readonly name: string;
    abstract run(): Promise<void>;
}

export type LabSeedType = new (...dependencies: never[]) => LabSeed;
