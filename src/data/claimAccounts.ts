/** The claim categories, with Transport + Travel and Meals + Entertainment each as one. */
export const CLAIM_CATEGORIES = ['Travel & Transport', 'Meals & Entertainment', 'Phone', 'Medical', 'Office supplies', 'Training', 'Others'];

/** Older claims used the separate names; they count as the merged category. */
export function canonicalCategory(category: string): string {
  const c = (category || '').trim().toLowerCase();
  if (/^(transport|travel|travel\s*(&|and)\s*transport|transport\s*(&|and)\s*travel)$/.test(c)) return 'Travel & Transport';
  if (/^(meals?|entertainment|meals?\s*(&|and)\s*entertainment)$/.test(c)) return 'Meals & Entertainment';
  return (category || '').trim();
}

/** The account each category usually goes to, by the account's name in the recommended chart. */
const DEFAULT_ACCOUNT_NAMES: Record<string, string> = {
  'Travel & Transport': 'Travel, Accommodation and Transport',
  'Meals & Entertainment': 'Meals and Entertainment',
  'Phone': 'Utilities',
  'Medical': 'Employee Benefits and Welfare',
  'Office supplies': 'Office Supplies, Printing and Postage',
  'Training': 'Staff Training and Recruitment',
};

type Acc = { id: number; name: string; type: string; subtype?: string | null; archived?: boolean };

/** The recommended account for a category when the company has not chosen one (none for "Others" or a name it lacks). */
export function defaultAccountFor(category: string, accounts: Acc[]): number | null {
  const want = DEFAULT_ACCOUNT_NAMES[canonicalCategory(category)];
  if (!want) return null;
  return accounts.find(a => a.type === 'expense' && !a.archived && a.name.trim().toLowerCase() === want.toLowerCase())?.id ?? null;
}

/** The expense account a category usually goes to (the recommended one, else by the standard chart's names), else General expenses. */
export function accountForCategory(category: string, accounts: Acc[]): number | null {
  const exp = accounts.filter(a => a.type === 'expense' && !a.archived);
  const named = defaultAccountFor(category, accounts);
  if (named) return named;
  const c = category.toLowerCase();
  const by = (re: RegExp) => exp.find(a => re.test(a.name.toLowerCase()))?.id;
  const guess =
    /transport|travel|taxi|parking|mileage/.test(c) ? by(/travel|transport/) :
    /meal|entertain|food/.test(c) ? by(/meal|entertain/) :
    /office|stationery|supplies/.test(c) ? by(/office/) :
    /software|subscription/.test(c) ? by(/software|subscription/) :
    /phone|internet|utilit/.test(c) ? by(/utilit|phone|telecom/) : undefined;
  return guess ?? exp.find(a => a.subtype === 'general')?.id ?? exp[0]?.id ?? null;
}
