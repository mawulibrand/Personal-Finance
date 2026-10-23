import { calculateFixedDepositValue, calculateInvestmentQuantity } from './investment.js';

export type PortfolioTransaction = {
  type: string;
  amount: string;
  quantity: string | null;
  transactionDate: Date;
};

export type PortfolioValuation = {
  valuationDate: Date;
  createdAt?: Date;
  marketValue: string;
  unitPrice: string | null;
  method: string;
};

export type PortfolioHoldingInput = {
  id: string;
  name: string;
  type: string;
  currencyCode: string;
  costBasis: string;
  startDate: Date;
  maturityDate: Date | null;
  annualInterestRate: string | null;
  interestMethod: 'SIMPLE' | 'COMPOUND' | null;
  compoundingFrequency: number | null;
  actualMaturityValue: string | null;
  status: 'ACTIVE' | 'CLOSED';
  closedAt: Date | null;
  transactions: PortfolioTransaction[];
  valuations: PortfolioValuation[];
};

export type CashFlow = { date: Date; amount: number };
type TwrPeriod = { from: string; to: string; returnRate: number; days: number };
type MetricExplanation = { formula: string; dataUsed: string[]; measurementPeriod: string; limitations: string[]; dataFreshness: string };
const round = (value: number, digits = 6) => Number(value.toFixed(digits));
const day = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const money = (value: number) => round(value, 4);
const transactionSign = (type: string) => ({
  BUY: -1,
  CONTRIBUTION: -1,
  SELL: 1,
  WITHDRAWAL: 1,
  DIVIDEND: 1,
  INTEREST: 1,
  FEE: -1,
  TAX: -1,
}[type] ?? 0);
const isCapitalInflow = (type: string) => type === 'BUY' || type === 'CONTRIBUTION';
const isCapitalOutflow = (type: string) => type === 'SELL' || type === 'WITHDRAWAL';
const isIncome = (type: string) => type === 'DIVIDEND' || type === 'INTEREST';
const isCost = (type: string) => type === 'FEE' || type === 'TAX';
const isExternalFlow = (type: string) => isCapitalInflow(type) || isCapitalOutflow(type);

function valueAt(holding: PortfolioHoldingInput, asOfDate: Date): number | null {
  if (holding.startDate > asOfDate) return null;
  if (holding.closedAt && holding.closedAt <= asOfDate) return 0;
  if (holding.type === 'FIXED_DEPOSIT') {
    if (!holding.maturityDate || !holding.annualInterestRate || !holding.interestMethod || !holding.compoundingFrequency) return null;
    return Number(calculateFixedDepositValue({
      principal: holding.costBasis,
      annualInterestRate: holding.annualInterestRate,
      interestMethod: holding.interestMethod,
      compoundingFrequency: holding.compoundingFrequency,
      startDate: holding.startDate,
      maturityDate: holding.maturityDate,
      valuationDate: asOfDate,
    }));
  }
  const valuation = holding.valuations
    .filter(item => item.valuationDate <= asOfDate)
    .sort((left, right) => right.valuationDate.getTime() - left.valuationDate.getTime()
      || (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0))[0];
  if (!valuation) return null;
  if (valuation.method === 'QUANTITY_X_PRICE' && valuation.unitPrice !== null) {
    const units = calculateInvestmentQuantity(holding.transactions, asOfDate);
    return Number(units.mul(valuation.unitPrice).toDecimalPlaces(4).toString());
  }
  return Number(valuation.marketValue);
}

function netPresentValue(rate: number, flows: CashFlow[]) {
  const firstFlow = flows[0];
  if (!firstFlow) return Number.NaN;
  const firstDate = day(firstFlow.date);
  return flows.reduce((total, flow) => total + flow.amount / ((1 + rate) ** ((day(flow.date) - firstDate) / (365 * 86400000))), 0);
}

export function calculateXirr(flows: CashFlow[]) {
  if (flows.length < 2 || !flows.some(flow => flow.amount < 0) || !flows.some(flow => flow.amount > 0)) return null;
  const ordered = [...flows].sort((left, right) => day(left.date) - day(right.date));
  const first = ordered[0];
  const last = ordered.at(-1);
  if (!first || !last || day(last.date) === day(first.date)) return null;
  let lower = -0.9999;
  let upper = 1;
  let lowerValue = netPresentValue(lower, ordered);
  let upperValue = netPresentValue(upper, ordered);
  while (lowerValue * upperValue > 0 && upper < 1024) {
    upper *= 2;
    upperValue = netPresentValue(upper, ordered);
  }
  if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue) || lowerValue * upperValue > 0) return null;
  for (let iteration = 0; iteration < 200; iteration++) {
    const middle = (lower + upper) / 2;
    const middleValue = netPresentValue(middle, ordered);
    if (!Number.isFinite(middleValue)) return null;
    if (Math.abs(middleValue) < 1e-8 || upper - lower < 1e-10) return middle;
    if (lowerValue * middleValue <= 0) {
      upper = middle;
      upperValue = middleValue;
    } else {
      lower = middle;
      lowerValue = middleValue;
    }
  }
  return null;
}

function valuationPoints(holding: PortfolioHoldingInput, asOfDate: Date) {
  const byDate = new Map<string, number>();
  for (const valuation of holding.valuations) {
    const date = dateOnly(valuation.valuationDate);
    if (valuation.valuationDate <= asOfDate) byDate.set(date, Number(valuation.marketValue));
  }
  return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((left, right) => left.date.localeCompare(right.date));
}

function holdingCashFlows(holding: PortfolioHoldingInput, asOfDate: Date, endValue: number): CashFlow[] {
  const flows = holding.transactions
    .filter(transaction => transaction.transactionDate <= asOfDate && transactionSign(transaction.type) !== 0)
    .map(transaction => ({ date: transaction.transactionDate, amount: Number(transaction.amount) * transactionSign(transaction.type) }));
  if (endValue > 0) flows.push({ date: asOfDate, amount: endValue });
  return flows.sort((left, right) => day(left.date) - day(right.date));
}

function twrForHoldings(holdings: PortfolioHoldingInput[], asOfDate: Date): { status: string; value: number | null; periods: TwrPeriod[] } {
  const dates = new Set<string>();
  for (const holding of holdings) {
    for (const point of valuationPoints(holding, asOfDate)) dates.add(point.date);
  }
  const currentDate = dateOnly(asOfDate);
  const canValueCurrent = holdings.every(holding => (
    holding.type === 'FIXED_DEPOSIT'
    || holding.status === 'CLOSED'
    || holding.startDate > asOfDate
    || holding.valuations.some(valuation => dateOnly(valuation.valuationDate) === currentDate)
  ));
  if (canValueCurrent) dates.add(currentDate);
  const sortedDates = [...dates].sort();
  const portfolioPoints = sortedDates.flatMap(date => {
    const pointDate = new Date(`${date}T00:00:00.000Z`);
    const activeHoldings = holdings.filter(holding => holding.startDate <= pointDate);
    const fullyObserved = activeHoldings.every(holding => (
      holding.type === 'FIXED_DEPOSIT'
      || holding.status === 'CLOSED'
      || holding.valuations.some(valuation => dateOnly(valuation.valuationDate) === date)
    ));
    const values = activeHoldings.map(holding => valueAt(holding, pointDate));
    return fullyObserved && values.length && values.every(value => value !== null)
      ? [{ date, value: values.reduce((sum, value) => sum + value!, 0) }]
      : [];
  });
  if (portfolioPoints.length < 2) return { status: 'NOT_ENOUGH_DATA', value: null, periods: [] };
  const periods: TwrPeriod[] = [];
  for (let index = 1; index < portfolioPoints.length; index++) {
    const previous = portfolioPoints[index - 1];
    const current = portfolioPoints[index];
    if (!previous || !current) continue;
    const from = new Date(`${previous.date}T00:00:00.000Z`);
    const to = new Date(`${current.date}T00:00:00.000Z`);
    if (current.value <= 0 || previous.value <= 0) continue;
    const intervening = holdings.flatMap(holding => holding.transactions)
      .filter(transaction => transaction.transactionDate > from && transaction.transactionDate <= to);
    if (intervening.some(transaction => isExternalFlow(transaction.type))) continue;
    const adjustment = intervening.reduce((sum, transaction) => {
      if (isIncome(transaction.type)) return sum + Number(transaction.amount);
      if (isCost(transaction.type)) return sum - Number(transaction.amount);
      return sum;
    }, 0);
    const returnRate = (current.value - previous.value + adjustment) / previous.value;
    if (returnRate > -1 && Number.isFinite(returnRate)) periods.push({ from: previous.date, to: current.date, returnRate, days: Math.round((day(to) - day(from)) / 86400000) });
  }
  if (periods.length === 0) return { status: 'NOT_ENOUGH_DATA', value: null, periods: [] };
  return { status: 'READY', value: periods.reduce((linked, period) => linked * (1 + period.returnRate), 1) - 1, periods };
}

function explanation(formula: string, dataUsed: string[], measurementPeriod: string, limitations: string[], freshness: string): MetricExplanation {
  return { formula, dataUsed, measurementPeriod, limitations, dataFreshness: freshness };
}

export function calculatePortfolioAnalytics(holdings: PortfolioHoldingInput[], asOfDate: Date) {
  const currencies = new Map<string, PortfolioHoldingInput[]>();
  for (const holding of holdings) {
    const currency = holding.currencyCode.trim();
    currencies.set(currency, [...(currencies.get(currency) ?? []), holding]);
  }
  const results = [...currencies.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, currencyHoldings]) => {
    const valued = currencyHoldings.map(holding => ({ holding, value: valueAt(holding, asOfDate) }));
    const valuedHoldings = valued.filter((item): item is { holding: PortfolioHoldingInput; value: number } => item.value !== null);
    const totalValue = valuedHoldings.reduce((sum, item) => sum + item.value, 0);
    const transactions = currencyHoldings.flatMap(holding => holding.transactions.filter(transaction => transaction.transactionDate <= asOfDate));
    const contributed = transactions.filter(transaction => isCapitalInflow(transaction.type)).reduce((sum, item) => sum + Number(item.amount), 0);
    const withdrawn = transactions.filter(transaction => isCapitalOutflow(transaction.type)).reduce((sum, item) => sum + Number(item.amount), 0);
    const investmentIncome = transactions.filter(transaction => isIncome(transaction.type)).reduce((sum, item) => sum + Number(item.amount), 0);
    const feesAndTaxes = transactions.filter(transaction => isCost(transaction.type)).reduce((sum, item) => sum + Number(item.amount), 0);
    const absoluteReturn = totalValue + withdrawn + investmentIncome - contributed - feesAndTaxes;
    const completeValuation = valuedHoldings.length === currencyHoldings.length;
    const returnPercent = completeValuation && contributed > 0 ? absoluteReturn / contributed * 100 : null;
    const cashFlows = currencyHoldings.flatMap(holding => {
      const currentValue = valueAt(holding, asOfDate) ?? 0;
      return holdingCashFlows(holding, asOfDate, currentValue);
    });
    const xirr = completeValuation ? calculateXirr(cashFlows) : null;
    const twr = twrForHoldings(currencyHoldings, asOfDate);
    const allocationMap = new Map<string, number>();
    for (const item of valuedHoldings) allocationMap.set(item.holding.type, (allocationMap.get(item.holding.type) ?? 0) + item.value);
    const allocation = [...allocationMap.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([type, value]) => ({
      type,
      value: money(value),
      percentage: totalValue > 0 ? round(value / totalValue * 100, 2) : null,
    }));
    const concentration = valuedHoldings.filter(item => item.value > 0)
      .sort((left, right) => right.value - left.value || left.holding.name.localeCompare(right.holding.name))
      .slice(0, 5)
      .map(item => ({ investmentId: item.holding.id, name: item.holding.name, type: item.holding.type, value: money(item.value), percentage: totalValue > 0 ? round(item.value / totalValue * 100, 2) : null }));
    const shares = valuedHoldings.filter(item => item.value > 0).map(item => item.value / totalValue);
    const hhi = shares.reduce((sum, share) => sum + share ** 2, 0);
    const periods = twr.periods;
    const averagePeriodDays = periods.length ? periods.reduce((sum, period) => sum + period.days, 0) / periods.length : 0;
    const meanReturn = periods.length ? periods.reduce((sum, period) => sum + period.returnRate, 0) / periods.length : 0;
    const sampleVariance = periods.length > 1 ? periods.reduce((sum, period) => sum + (period.returnRate - meanReturn) ** 2, 0) / (periods.length - 1) : null;
    const volatility = sampleVariance !== null && averagePeriodDays > 0 ? Math.sqrt(sampleVariance) * Math.sqrt(365 / averagePeriodDays) * 100 : null;
    const today = day(asOfDate);
    const buckets = [
      { key: '0-30 days', max: 30 },
      { key: '31-90 days', max: 90 },
      { key: '91-180 days', max: 180 },
      { key: '181-365 days', max: 365 },
      { key: 'More than 1 year', max: Infinity },
    ];
    const maturityExposure = buckets.map((bucket, index) => {
      const previousBucket = buckets[index - 1];
      const minDays = previousBucket ? previousBucket.max + 1 : 0;
      const amount = valuedHoldings.filter(({ holding }) => holding.type === 'FIXED_DEPOSIT' && holding.status === 'ACTIVE' && holding.maturityDate)
        .filter(({ holding }) => {
          const daysRemaining = Math.floor((day(holding.maturityDate!) - today) / 86400000);
          return daysRemaining >= minDays && daysRemaining <= bucket.max;
        })
        .reduce((sum, item) => sum + item.value, 0);
      return { bucket: bucket.key, value: money(amount), percentage: totalValue > 0 ? round(amount / totalValue * 100, 2) : null };
    });
    const datePoints = [...new Set(currencyHoldings.flatMap(holding => valuationPoints(holding, asOfDate).map(point => point.date)))]
      .filter(date => currencyHoldings.every(holding => (
        holding.type === 'FIXED_DEPOSIT'
        || holding.status === 'CLOSED'
        || holding.startDate > new Date(`${date}T00:00:00.000Z`)
        || holding.valuations.some(valuation => dateOnly(valuation.valuationDate) === date)
      )))
      .sort();
    const comparison = datePoints.length >= 2 ? (() => {
      const first = new Date(`${datePoints[0]}T00:00:00.000Z`);
      const last = new Date(`${datePoints.at(-1)}T00:00:00.000Z`);
      const firstValue = currencyHoldings.map(holding => valueAt(holding, first));
      const lastValue = currencyHoldings.map(holding => valueAt(holding, last));
      const validFirst = firstValue.filter((value): value is number => value !== null);
      const validLast = lastValue.filter((value): value is number => value !== null);
      if (validFirst.length !== currencyHoldings.length || validLast.length !== currencyHoldings.length) return { status: 'NOT_ENOUGH_DATA', from: datePoints[0], to: datePoints.at(-1), change: null, percentage: null };
      const startingValue = validFirst.reduce((sum, value) => sum + value, 0);
      const endingValue = validLast.reduce((sum, value) => sum + value, 0);
      return { status: startingValue > 0 ? 'READY' : 'NOT_ENOUGH_DATA', from: datePoints[0], to: datePoints.at(-1), change: money(endingValue - startingValue), percentage: startingValue > 0 ? round((endingValue / startingValue - 1) * 100, 2) : null };
    })() : { status: 'NOT_ENOUGH_DATA', from: null, to: null, change: null, percentage: null };
    const latestDates = currencyHoldings.flatMap(holding => holding.valuations.map(valuation => valuation.valuationDate).filter(date => date <= asOfDate));
    const latestDate = latestDates.length ? latestDates.reduce((latest, date) => date > latest ? date : latest) : null;
    const freshness = latestDate ? `${Math.floor((today - day(latestDate)) / 86400000)} days since latest saved valuation; fixed deposits are contractually calculated through ${dateOnly(asOfDate)}.` : `No saved market valuations as of ${dateOnly(asOfDate)}.`;
    const allDataUsed = ['Investment transactions', 'Saved valuations', 'Fixed-deposit contractual terms'];
    const descriptions = {
      absoluteReturn: explanation('Current market value + proceeds + investment income − contributions − fees and taxes.', allDataUsed, `Through ${dateOnly(asOfDate)}`, ['Excludes tax treatment, FX translation, and unrecorded cash flows.', 'Unavailable if any holding has no usable current value.'], freshness),
      returnPercent: explanation('Absolute return ÷ gross recorded contributions × 100.', allDataUsed, `Through ${dateOnly(asOfDate)}`, ['Uses gross recorded purchases/contributions as the denominator; it is not an annualized rate.', 'Unavailable when no contributions are recorded.'], freshness),
      xirr: explanation('Annual rate r solving Σ CFᵢ / (1 + r)^((dateᵢ − date₀)/365) = 0 using bounded bisection.', ['Dated investment transactions', 'Current valued holdings'], `Through ${dateOnly(asOfDate)}`, ['No result is returned unless positive and negative dated cash flows produce a convergent root.', 'Historical FX and unrecorded flows are excluded.'], freshness),
      twr: explanation('Geometrically link period returns; each period adjusts recorded investment income, fees, and taxes.', ['At least two dated portfolio valuations', 'Transactions between valuation dates'], `Through ${dateOnly(asOfDate)}`, ['Periods containing purchases, contributions, sales, or withdrawals are omitted because intermediate valuations are unavailable.', 'A current point is included only when every active holding can be valued.'], freshness),
      allocation: explanation('Holding market value ÷ total valued market value by investment type.', ['Current dated values'], `As of ${dateOnly(asOfDate)}`, ['Unvalued holdings are excluded; currencies are never combined.'], freshness),
      concentration: explanation('Each holding market value ÷ total valued market value; top five holdings shown.', ['Current dated values'], `As of ${dateOnly(asOfDate)}`, ['Unvalued holdings are excluded; currencies are never combined.'], freshness),
      diversification: explanation('Herfindahl-Hirschman Index = Σ holding share²; effective holding count = 1 ÷ HHI.', ['Current dated values'], `As of ${dateOnly(asOfDate)}`, ['Counts holdings, not underlying issuers or correlated exposures; does not assess investment risk.'], freshness),
      volatility: explanation('Sample standard deviation of valid TWR period returns, annualized by √(365 ÷ average period days).', ['Valid TWR periods'], `Through ${dateOnly(asOfDate)}`, ['Requires at least two valid periods; sparse valuations are not a reliable risk forecast.'], freshness),
      contributionAnalysis: explanation('Separate purchases/contributions, sale/withdrawal proceeds, investment income, and fees/taxes.', ['Dated investment transactions'], `Through ${dateOnly(asOfDate)}`, ['Unrecorded provider transactions are not included.'], freshness),
      maturityExposure: explanation('Current fixed-deposit value grouped by calendar days remaining to contractual maturity.', ['Fixed-deposit terms and current contractual values'], `As of ${dateOnly(asOfDate)}`, ['Does not include provider default risk or reinvestment assumptions.'], freshness),
      historicalComparison: explanation('Compare total valued portfolio at the earliest and latest dates with saved valuations.', ['Saved dated valuations', 'Fixed-deposit contractual values'], 'Earliest to latest comparable saved valuation date', ['Requires all holdings to have usable values on both dates.', 'Not time-weighted and does not translate currencies.'], freshness),
    };
    return {
      currencyCode,
      status: valuedHoldings.length ? 'READY' : 'NOT_ENOUGH_DATA',
      asOfDate: dateOnly(asOfDate),
      holdingCount: currencyHoldings.length,
      valuedHoldingCount: valuedHoldings.length,
      totalValue: money(totalValue),
      absoluteReturn: completeValuation && contributed > 0 ? money(absoluteReturn) : null,
      returnPercent: returnPercent === null ? null : round(returnPercent, 2),
      annualizedReturn: xirr === null ? null : round(xirr * 100, 2),
      metricStatus: {
        absoluteReturn: completeValuation && contributed > 0 ? 'READY' : 'NOT_ENOUGH_DATA',
        returnPercent: returnPercent === null ? 'NOT_ENOUGH_DATA' : 'READY',
        xirr: xirr === null ? 'NOT_ENOUGH_DATA' : 'READY',
        twr: twr.status,
        allocation: completeValuation && totalValue > 0 ? 'READY' : 'NOT_ENOUGH_DATA',
        concentration: completeValuation && totalValue > 0 ? 'READY' : 'NOT_ENOUGH_DATA',
        diversification: completeValuation && shares.length ? 'READY' : 'NOT_ENOUGH_DATA',
        volatility: completeValuation && volatility !== null ? 'READY' : 'NOT_ENOUGH_DATA',
        contributionAnalysis: transactions.length ? 'READY' : 'NOT_ENOUGH_DATA',
        maturityExposure: completeValuation ? 'READY' : 'NOT_ENOUGH_DATA',
        historicalComparison: comparison.status,
      },
      xirr: { status: xirr === null ? 'NOT_ENOUGH_DATA' : 'READY', value: xirr === null ? null : round(xirr * 100, 2) },
      twr: { status: twr.status, value: twr.value === null ? null : round(twr.value * 100, 2), periods: periods.map(period => ({ ...period, returnPercent: round(period.returnRate * 100, 2) })) },
      allocation,
      concentration,
      diversification: { status: shares.length ? 'READY' : 'NOT_ENOUGH_DATA', hhi: shares.length ? round(hhi, 4) : null, effectiveHoldingCount: hhi ? round(1 / hhi, 2) : null },
      volatility: { status: volatility === null ? 'NOT_ENOUGH_DATA' : 'READY', annualizedPercent: volatility === null ? null : round(volatility, 2), periodCount: periods.length },
      contributions: {
        invested: money(contributed),
        proceeds: money(withdrawn),
        investmentIncome: money(investmentIncome),
        feesAndTaxes: money(feesAndTaxes),
        netGain: completeValuation && contributed > 0 ? money(absoluteReturn) : null,
      },
      maturityExposure,
      historicalComparison: comparison,
      explanations: descriptions,
    };
  });
  return { asOfDate: dateOnly(asOfDate), status: results.length ? 'READY' : 'NOT_ENOUGH_DATA', currencies: results };
}
