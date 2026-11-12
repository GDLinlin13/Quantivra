/** The expense account a category usually goes to (by the standard chart's names), else General expenses. */
export function accountForCategory(category: string, accounts: { id: number; name: string; type: string; subtype?: string | null; archived?: boolean }[]): number | null {
  const exp = accounts.filter(a => a.type === 'expense' && !a.archived);
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

