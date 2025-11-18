import { v4 as uuidv4 } from 'uuid';

export interface TestGroup {
    name: string;
    email: string;
    institution: string;
    addressLine1: string;
    city: string;
    zipCode: string;
    country: string;
}

export const readonlyGroup: TestGroup = {
    name: 'readonly-group',
    email: 'readonly-group@example.com',
    institution: 'Readonly Institute',
    addressLine1: '123 Readonly Street',
    city: 'Readonly City',
    zipCode: '12345',
    country: 'USA',
};

export const buildTestGroup = (name = `test_group_${uuidv4().slice(0, 8)}`): TestGroup => ({
    name,
    email: `test_${uuidv4().slice(0, 8)}@test.com`,
    institution: 'Test Institution',
    addressLine1: '123 Test Street',
    city: 'Test City',
    zipCode: '12345',
    country: 'USA',
});
