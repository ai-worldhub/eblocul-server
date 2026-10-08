const APARTMENTS_PER_FLOOR = 4;

export type ApartmentRange = {
    firstApartment: number;
    lastApartment: number;
};

export type SeedApartment = { number: string; floor: number };

export const apartmentsIn = (range: ApartmentRange): SeedApartment[] =>
    Array.from(
        { length: range.lastApartment - range.firstApartment + 1 },
        (_, position) => ({
            number: String(range.firstApartment + position),
            floor: Math.floor(position / APARTMENTS_PER_FLOOR) + 1,
        }),
    );
