import { describe, it, expect } from 'vitest';
import { canonicalCategory, defaultAccountFor, accountForCategory, CLAIM_CATEGORIES } from '../claimAccounts';

const acc = (id: number, name: string, extra: any = {}) => ({ id, name, type: 'expense', archived: false, ...extra });
const accounts = [
  acc(1, 'Travel, Accommodation and Transport'), acc(2, 'Meals and Entertainment'), acc(3, 'Utilities'),
  acc(4, 'Employee Benefits and Welfare'), acc(5, 'Office Supplies, Printing and Postage'), acc(6, 'Staff Training and Recruitment'),
  acc(7, 'General expenses', { subtype: 'general' }),
];

describe('claim categories', () => {
  it('Transport and Travel are one, and so are Meals and Entertainment', () => {
    expect(CLAIM_CATEGORIES.slice(0, 2)).toEqual(['Travel & Transport', 'Meals & Entertainment']);
    expect(['Transport', 'travel', 'Travel & Transport'].map(canonicalCategory)).toEqual(['Travel & Transport', 'Travel & Transport', 'Travel & Transport']);
    expect(['Meals', 'Entertainment'].map(canonicalCategory)).toEqual(['Meals & Entertainment', 'Meals & Entertainment']);
    expect(canonicalCategory('Taxi')).toBe('Taxi');
  });
  it('each category goes to its recommended account, older names included', () => {
    expect(['Travel & Transport', 'Transport', 'Meals & Entertainment', 'Entertainment', 'Phone', 'Medical', 'Office supplies', 'Training'].map(c => defaultAccountFor(c, accounts)))
      .toEqual([1, 1, 2, 2, 3, 4, 5, 6]);
    expect(defaultAccountFor('Others', accounts)).toBeNull();
    expect(accountForCategory('Others', accounts)).toBe(7);          // the general account until one is picked
  });
});
