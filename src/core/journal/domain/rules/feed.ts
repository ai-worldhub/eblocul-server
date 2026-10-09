import { JournalError } from '../journal.errors.ts';

export const SMALL_SUBTREE_NODES = 24;

export type FeedPeriod = { from: Date | null; to: Date | null };

const momentOf = (text: string | undefined): Date | null =>
    text === undefined ? null : new Date(text);

export const periodOf = (
    from: string | undefined,
    to: string | undefined,
): FeedPeriod => {
    const period = { from: momentOf(from), to: momentOf(to) };
    const moments = [period.from, period.to].filter(
        (moment) => moment !== null,
    );
    const isOrdered =
        period.from === null ||
        period.to === null ||
        period.from.getTime() < period.to.getTime();
    if (
        moments.some((moment) => Number.isNaN(moment.getTime())) ||
        !isOrdered
    ) {
        throw new JournalError(
            'JOURNAL_PERIOD_INVALID',
            'The period starts at a moment before the one it ends at',
        );
    }
    return period;
};

export const knownActionOf = (
    names: readonly string[],
    action: string | undefined,
): string | null => {
    if (action === undefined) {
        return null;
    }
    if (!names.includes(action)) {
        throw new JournalError(
            'JOURNAL_ACTION_UNKNOWN',
            'No journal action carries this name',
        );
    }
    return action;
};

export const isSmallSubtree = (nodeCount: number): boolean =>
    nodeCount <= SMALL_SUBTREE_NODES;
