export default {
    '*.ts': [
        'prettier --write',
        'oxlint -c oxlint.json --type-aware',
        () => 'tsc --noEmit -p tsconfig.json',
    ],
    '*.{json,md,yml}': 'prettier --write',
};
