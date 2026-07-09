export function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function formatMoney(amount: string | number, currency: string) {
  return new Intl.NumberFormat(navigator.language, {
    style: "currency",
    currency,
  }).format(Number(amount));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat(navigator.language, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * TransactionDto/InvestmentTransactionDto amounts are positive = money OUT (Plaid convention).
 * Returns the display-flipped signed amount plus a semantic color for the UI.
 */
export function signedTransactionAmount(amount: string, currency: string) {
  const value = Number(amount);
  const isOutflow = value > 0;
  const formatted = formatMoney(Math.abs(value), currency);
  return {
    text: `${isOutflow ? "−" : "+"}${formatted}`,
    color: isOutflow ? "text-danger" : "text-success",
  };
}

/** RecurringStreamDto amounts are unsigned magnitudes; direction carries the sign. */
export function directionalAmount(amount: string, currency: string, direction: "inflow" | "outflow") {
  const formatted = formatMoney(Math.abs(Number(amount)), currency);
  return {
    text: `${direction === "outflow" ? "−" : "+"}${formatted}`,
    color: direction === "outflow" ? "text-danger" : "text-success",
  };
}
