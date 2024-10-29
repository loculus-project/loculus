import { v4 as uuidv4 } from 'uuid';
import { TestAccount } from '../types/auth.types';

export function generateTestAccount(prefix = 'test'): TestAccount {
  return {
    username: `${prefix}_user_${uuidv4().slice(0, 8)}`,
    password: 'password',
    email: `${prefix}_${uuidv4().slice(0, 8)}@test.com`,
    firstName: `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}`,
    lastName: 'User',
    organization: 'Test University'
  };
}
