import { clientAddressKey } from '../../../src/core/throttle/domain/rules/client-address.ts';

describe('clientAddressKey', () => {
    it('keeps an IPv4 address whole', () => {
        expect(clientAddressKey('203.0.113.7')).toBe('203.0.113.7');
        expect(clientAddressKey(' 203.0.113.7 ')).toBe('203.0.113.7');
    });

    it('reads an IPv4 address written as IPv6', () => {
        expect(clientAddressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
        expect(clientAddressKey('::FFFF:cb00:7107')).toBe('203.0.113.7');
        expect(clientAddressKey('0:0:0:0:0:ffff:203.0.113.7')).toBe(
            '203.0.113.7',
        );
    });

    it('cuts an IPv6 address to its /64 prefix', () => {
        const prefix = '2001:db8:1:2::/64';

        expect(clientAddressKey('2001:db8:1:2::1')).toBe(prefix);
        expect(
            clientAddressKey('2001:0DB8:0001:0002:ffff:ffff:ffff:ffff'),
        ).toBe(prefix);
        expect(clientAddressKey('2001:db8:1:2:a:b:c:d%eth0')).toBe(prefix);
        expect(clientAddressKey('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
        expect(clientAddressKey('::1')).toBe('0:0:0:0::/64');
    });

    it('drops the port a proxy may write after the address', () => {
        expect(clientAddressKey('203.0.113.7:54321')).toBe('203.0.113.7');
        expect(clientAddressKey('[2001:db8:1:2::1]:443')).toBe(
            '2001:db8:1:2::/64',
        );
        expect(clientAddressKey('[2001:db8:1:2::1]')).toBe('2001:db8:1:2::/64');
    });

    it('writes one address one way', () => {
        expect(clientAddressKey('203.000.113.007')).toBe('203.0.113.7');
        expect(clientAddressKey('2001:DB8:0:0:0:0:0:1')).toBe(
            clientAddressKey('2001:db8::1'),
        );
    });

    it('gives one key to every request without a readable address', () => {
        for (const address of [
            undefined,
            '',
            'unknown',
            '203.0.113',
            '203.0.113.256',
            '2001:db8:::1',
            '1:2:3:4:5:6:7:8:9',
            'client.example.com',
        ]) {
            expect(clientAddressKey(address)).toBe('unknown');
        }
    });
});
