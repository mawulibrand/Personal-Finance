const SCALE = 10_000n;

export function decimalToUnits(value: string) {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const units = BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, '0').slice(0, 4));
  return negative ? -units : units;
}

export function unitsToDecimal(units: bigint) {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(4, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function addDecimals(...values: string[]) {
  return unitsToDecimal(values.reduce((sum, value) => sum + decimalToUnits(value), 0n));
}

export function subtractDecimals(left: string, right: string) {
  return unitsToDecimal(decimalToUnits(left) - decimalToUnits(right));
}
