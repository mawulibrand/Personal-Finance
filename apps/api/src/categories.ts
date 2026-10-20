export const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'INCOME' },
  { name: 'Self-employment', type: 'INCOME' },
  { name: 'Business income', type: 'INCOME' },
  { name: 'Investment income', type: 'INCOME' },
  { name: 'Gifts and support', type: 'INCOME' },
  { name: 'Other income', type: 'INCOME' },
  { name: 'Housing', type: 'EXPENSE' },
  { name: 'Food and groceries', type: 'EXPENSE' },
  { name: 'Transport', type: 'EXPENSE' },
  { name: 'Utilities', type: 'EXPENSE' },
  { name: 'Communication', type: 'EXPENSE' },
  { name: 'Healthcare', type: 'EXPENSE' },
  { name: 'Education', type: 'EXPENSE' },
  { name: 'Debt payments', type: 'EXPENSE' },
  { name: 'Family support', type: 'EXPENSE' },
  { name: 'Personal care', type: 'EXPENSE' },
  { name: 'Clothing', type: 'EXPENSE' },
  { name: 'Entertainment', type: 'EXPENSE' },
  { name: 'Giving', type: 'EXPENSE' },
  { name: 'Other expense', type: 'EXPENSE' },
] as const;

export function normalizeCategoryName(name: string) {
  return name.normalize('NFKC').trim().toLowerCase();
}
