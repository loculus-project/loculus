import { backendClient, dummyOrganism, expect, test } from './e2e.fixture.ts';

const tokenSignedWithDifferentKey =
    'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE3MDE0MjMyNzAsImlhdCI6MTcwMTMzNjg3MCwicHJlZmVycmVkX3VzZXJuYW1lIjoidGVzdFVzZXIifQ' +
    '.FMVL2JLVV3VloGMXpinviq-37GU11OiuTh70VwAlWH2pnRfpGs1SeSWsvQm9dbr67UwbJfiHrTuprk5VeENkzPcnZ7FlY8XPLdmewsu7-pG2BZ' +
    'sXhBlz_gruqx5HmIIaufXHk8zbyZomxciwp-vUx6uvh4q5gGVQxGwh5H3wz3dVinFn6k8gFIL3i7ltV9ACO0tSJxPA1E_lx5kmQmnztWkWakrzG' +
    '3b2K726UGDI8eO18Oezi1TCSPZnCLhiPY0-kgqhi42ASW4EwEGFsD-jPqInrSlaRwKitSe_QbKOJz1afQnwRxXwf1IbtzJZ3UF4td1KcnR-qtyo' +
    'kxJWFxJ4-w';

test.describe('The backend', () => {
    test('should reject a call with a token that was not signed by Keycloak', async () => {
        const response = await backendClient.getDataToEdit(dummyOrganism.key, tokenSignedWithDifferentKey, '1', 1);
        expect(response._unsafeUnwrapErr().detail).toContain('Invalid signature');
    });
});
