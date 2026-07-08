import { Prisma } from "@prisma/client";
import {
  APR,
  CreditCardLiability as PlaidCreditCard,
  MortgageLiability as PlaidMortgage,
  StudentLoan as PlaidStudentLoan,
} from "plaid";
import { LiabilityKind } from "@fin/shared";

/** Parse a Plaid `YYYY-MM-DD` date string into a UTC-midnight Date (for @db.Date). */
function plaidDate(d: string | null | undefined): Date | null {
  return d ? new Date(`${d}T00:00:00.000Z`) : null;
}

/** Plaid number -> decimal string (preserves precision Prisma stores), or null. */
function dec(n: number | null | undefined): string | null {
  return n != null ? n.toString() : null;
}

/** Shape we persist for a liability (matches Prisma Liability scalar fields). */
export interface LiabilityRecord {
  accountId: string;
  kind: LiabilityKind;
  aprPercentage: string | null;
  lastPaymentAmount: string | null;
  lastPaymentDate: Date | null;
  lastStatementBalance: string | null;
  lastStatementIssueDate: Date | null;
  minimumPaymentAmount: string | null;
  nextPaymentDueDate: Date | null;
  isOverdue: boolean | null;
  details: Prisma.InputJsonValue;
}

/** Credit card's representative APR: the purchase APR if present, else the first. */
function purchaseApr(aprs: APR[]): number | null {
  if (aprs.length === 0) return null;
  const purchase = aprs.find((a) => String(a.apr_type) === "purchase_apr");
  return (purchase ?? aprs[0]).apr_percentage ?? null;
}

export function mapCreditCardLiability(accountId: string, c: PlaidCreditCard): LiabilityRecord {
  return {
    accountId,
    kind: "credit",
    aprPercentage: dec(purchaseApr(c.aprs ?? [])),
    lastPaymentAmount: dec(c.last_payment_amount),
    lastPaymentDate: plaidDate(c.last_payment_date),
    lastStatementBalance: dec(c.last_statement_balance),
    lastStatementIssueDate: plaidDate(c.last_statement_issue_date),
    minimumPaymentAmount: dec(c.minimum_payment_amount),
    nextPaymentDueDate: plaidDate(c.next_payment_due_date),
    isOverdue: c.is_overdue ?? null,
    details: { aprs: c.aprs ?? [] } as unknown as Prisma.InputJsonValue,
  };
}

export function mapStudentLoan(accountId: string, s: PlaidStudentLoan): LiabilityRecord {
  return {
    accountId,
    kind: "student",
    aprPercentage: dec(s.interest_rate_percentage),
    lastPaymentAmount: dec(s.last_payment_amount),
    lastPaymentDate: plaidDate(s.last_payment_date),
    lastStatementBalance: dec(s.last_statement_balance),
    lastStatementIssueDate: plaidDate(s.last_statement_issue_date),
    minimumPaymentAmount: dec(s.minimum_payment_amount),
    nextPaymentDueDate: plaidDate(s.next_payment_due_date),
    isOverdue: s.is_overdue ?? null,
    details: {
      loanName: s.loan_name ?? null,
      loanStatus: s.loan_status ?? null,
      expectedPayoffDate: s.expected_payoff_date ?? null,
      outstandingInterestAmount: s.outstanding_interest_amount ?? null,
      originationPrincipalAmount: s.origination_principal_amount ?? null,
      ytdInterestPaid: s.ytd_interest_paid ?? null,
      ytdPrincipalPaid: s.ytd_principal_paid ?? null,
    } as unknown as Prisma.InputJsonValue,
  };
}

export function mapMortgageLiability(accountId: string, m: PlaidMortgage): LiabilityRecord {
  return {
    accountId,
    kind: "mortgage",
    aprPercentage: dec(m.interest_rate?.percentage),
    lastPaymentAmount: dec(m.last_payment_amount),
    lastPaymentDate: plaidDate(m.last_payment_date),
    // Mortgages have no statement balance; use the next scheduled monthly payment
    // as the "minimum payment due" so the common columns stay populated.
    lastStatementBalance: null,
    lastStatementIssueDate: null,
    minimumPaymentAmount: dec(m.next_monthly_payment),
    nextPaymentDueDate: plaidDate(m.next_payment_due_date),
    isOverdue: m.past_due_amount != null ? m.past_due_amount > 0 : null,
    details: {
      interestRate: m.interest_rate ?? null,
      maturityDate: m.maturity_date ?? null,
      pastDueAmount: m.past_due_amount ?? null,
      escrowBalance: m.escrow_balance ?? null,
      originationPrincipalAmount: m.origination_principal_amount ?? null,
      loanTypeDescription: m.loan_type_description ?? null,
      loanTerm: m.loan_term ?? null,
      ytdInterestPaid: m.ytd_interest_paid ?? null,
      ytdPrincipalPaid: m.ytd_principal_paid ?? null,
    } as unknown as Prisma.InputJsonValue,
  };
}
