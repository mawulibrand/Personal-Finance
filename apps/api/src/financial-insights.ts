export type RuleOperator = 'LESS_THAN' | 'GREATER_THAN';
export type RuleSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type FinancialRule = {
  code: string;
  metric: 'savingsRatePercent' | 'monthlyCashFlow' | 'emergencyFundMonths';
  operator: RuleOperator;
  threshold: number;
  severity: RuleSeverity;
  enabled: boolean;
};
export type FinancialProfile = {
  currencyCode: string;
  periodStart: string;
  periodEnd: string;
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  savingsRatePercent: number | null;
  monthlyCashFlow: number | null;
  savingsBalance: number | null;
  emergencyFundMonths: number | null;
  netWorthByCurrency: Array<{ currencyCode: string; netWorth: number }>;
  dataFreshness: 'UP_TO_DATE' | 'UPDATE_RECOMMENDED';
  limitations: string[];
};
export type FinancialStrategy = {
  code: string;
  severity: RuleSeverity;
  title: string;
  explanation: string;
  observedValue: number;
  threshold: number;
};

export function isFinancialRuleMetric(value: string): value is FinancialRule['metric'] {
  return value === 'savingsRatePercent' || value === 'monthlyCashFlow' || value === 'emergencyFundMonths';
}

const strategyCopy: Record<string, { title: string; explanation: string }> = {
  SAVINGS_RATE_BELOW_TARGET: {
    title: 'Review your monthly saving target',
    explanation: 'Your recorded income and expenses show a savings rate below the configured threshold. Consider reviewing recent spending and choose a savings amount that remains realistic for you.',
  },
  EXPENSES_EXCEED_INCOME: {
    title: 'Review monthly cash flow',
    explanation: 'Recorded expenses were higher than recorded income in the review period. Check that records are complete, then review upcoming expenses before changing your financial commitments.',
  },
  EMERGENCY_FUND_BELOW_TARGET: {
    title: 'Review your emergency reserve',
    explanation: 'Tracked savings cover fewer months of average expenses than the configured threshold. Savings balances may include money earmarked for other goals, so review your accounts before treating them as available reserves.',
  },
};

export function evaluateFinancialRules(profile: FinancialProfile, rules: FinancialRule[]): FinancialStrategy[] {
  const values: Record<FinancialRule['metric'], number | null> = {
    savingsRatePercent: profile.savingsRatePercent,
    monthlyCashFlow: profile.monthlyCashFlow,
    emergencyFundMonths: profile.emergencyFundMonths,
  };
  return rules.flatMap(rule => {
    const observedValue = values[rule.metric];
    const copy = strategyCopy[rule.code];
    if (!rule.enabled || observedValue === null || !copy) return [];
    const triggered = rule.operator === 'LESS_THAN'
      ? observedValue < rule.threshold
      : observedValue > rule.threshold;
    return triggered ? [{
      code: rule.code,
      severity: rule.severity,
      title: copy.title,
      explanation: copy.explanation,
      observedValue: Number(observedValue.toFixed(4)),
      threshold: rule.threshold,
    }] : [];
  }).sort((left, right) => {
    const rank: Record<RuleSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return rank[left.severity] - rank[right.severity] || left.code.localeCompare(right.code);
  });
}
