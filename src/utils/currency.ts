import Decimal from 'decimal.js';

type DecimalValue = number | string | InstanceType<typeof Decimal>;

export function formatCurrency(amount: DecimalValue, currency: string): string {
  const dec = new Decimal(String(amount));
  const num = dec.toNumber();

  switch (currency.toUpperCase()) {
    case 'TRY':
      return `₺${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'EUR':
      return `€${num.toLocaleString('en-EU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'USD':
      return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'GBP':
      return `£${num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    default:
      return `${num.toFixed(2)} ${currency}`;
  }
}

export function addCurrency(a: DecimalValue, b: DecimalValue): InstanceType<typeof Decimal> {
  return new Decimal(String(a)).plus(new Decimal(String(b)));
}

export function subtractCurrency(a: DecimalValue, b: DecimalValue): InstanceType<typeof Decimal> {
  return new Decimal(String(a)).minus(new Decimal(String(b)));
}

export function multiplyCurrency(a: DecimalValue, b: DecimalValue): InstanceType<typeof Decimal> {
  return new Decimal(String(a)).times(new Decimal(String(b)));
}

export function hasSufficientBalance(balance: DecimalValue, required: DecimalValue): boolean {
  return new Decimal(String(balance)).gte(new Decimal(String(required)));
}
