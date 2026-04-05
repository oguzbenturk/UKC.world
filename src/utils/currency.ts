import Decimal from 'decimal.js';

export function formatCurrency(amount: number | string | Decimal, currency: string): string {
  const dec = new Decimal(amount);
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

export function addCurrency(a: number | string | Decimal, b: number | string | Decimal): Decimal {
  return new Decimal(a).plus(new Decimal(b));
}

export function subtractCurrency(a: number | string | Decimal, b: number | string | Decimal): Decimal {
  return new Decimal(a).minus(new Decimal(b));
}

export function multiplyCurrency(a: number | string | Decimal, b: number | string | Decimal): Decimal {
  return new Decimal(a).times(new Decimal(b));
}

export function hasSufficientBalance(balance: number | string | Decimal, required: number | string | Decimal): boolean {
  return new Decimal(balance).gte(new Decimal(required));
}
