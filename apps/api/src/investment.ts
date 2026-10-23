import { Prisma } from '@pf/database';

export type InvestmentTransactionForQuantity = {
  type: string;
  quantity: string | Prisma.Decimal | null;
  transactionDate: Date;
};

export type DatedInvestmentTransaction = InvestmentTransactionForQuantity & {
  id?: string;
  createdAt: Date;
};

const decimal = (value: string | Prisma.Decimal) => new Prisma.Decimal(value);
const utcDate = (value: Date) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

export function calculateFixedDepositValue(input: {
  principal: string;
  annualInterestRate: string;
  interestMethod: 'SIMPLE' | 'COMPOUND';
  compoundingFrequency: number;
  startDate: Date;
  maturityDate: Date;
  valuationDate: Date;
}) {
  const valuationTime = Math.min(utcDate(input.valuationDate), utcDate(input.maturityDate));
  const elapsedDays = Math.max(0, Math.floor((valuationTime - utcDate(input.startDate)) / 86400000));
  const years = new Prisma.Decimal(elapsedDays).div(365);
  const rate = decimal(input.annualInterestRate).div(100);
  const principal = decimal(input.principal);
  const factor = input.interestMethod === 'SIMPLE'
    ? new Prisma.Decimal(1).plus(rate.mul(years))
    : new Prisma.Decimal(1).plus(rate.div(input.compoundingFrequency)).pow(new Prisma.Decimal(input.compoundingFrequency).mul(years));
  return principal.mul(factor).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);
}

function signedQuantity(type: string, quantity: string | Prisma.Decimal | null) {
  if (quantity === null) return new Prisma.Decimal(0);
  const value = decimal(quantity);
  return type === 'SELL' || type === 'WITHDRAWAL' ? value.negated() : type === 'BUY' || type === 'CONTRIBUTION' ? value : new Prisma.Decimal(0);
}

export function calculateInvestmentQuantity(transactions: InvestmentTransactionForQuantity[], asOfDate: Date) {
  return transactions.reduce((quantity, transaction) => (
    transaction.transactionDate <= asOfDate ? quantity.plus(signedQuantity(transaction.type, transaction.quantity)) : quantity
  ), new Prisma.Decimal(0));
}

export function validateInvestmentQuantityHistory(transactions: DatedInvestmentTransaction[], newTransaction: InvestmentTransactionForQuantity) {
  const history = [...transactions, { ...newTransaction, createdAt: new Date(), id: undefined }]
    .sort((left, right) => left.transactionDate.getTime() - right.transactionDate.getTime()
      || left.createdAt.getTime() - right.createdAt.getTime()
      || (left.id ?? '').localeCompare(right.id ?? ''));
  let quantity = new Prisma.Decimal(0);
  for (const transaction of history) {
    quantity = quantity.plus(signedQuantity(transaction.type, transaction.quantity));
    if (quantity.isNegative()) return false;
  }
  return true;
}
