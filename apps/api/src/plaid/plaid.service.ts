import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AccountBase,
  Configuration,
  CountryCode,
  InvestmentsHoldingsGetResponse,
  InvestmentsTransactionsGetResponse,
  JWKPublicKey,
  LiabilitiesGetResponse,
  PlaidApi,
  PlaidEnvironments,
  Products,
  SandboxItemFireWebhookRequestWebhookCodeEnum,
  TransactionsRecurringGetResponse,
  TransactionsSyncResponse,
} from "plaid";

/**
 * Thin wrapper over the Plaid Node SDK. Only knows how to talk to Plaid — it has
 * no database or business logic (that lives in ItemsService). One place to
 * configure the client and to centralize the exact API calls we use.
 */
@Injectable()
export class PlaidService {
  private readonly client: PlaidApi;
  private readonly clientName = "fin-dashboard";
  private readonly webhookUrl?: string;

  constructor(config: ConfigService) {
    const env = (config.get<string>("PLAID_ENV") ?? "sandbox") as keyof typeof PlaidEnvironments;
    this.webhookUrl = config.get<string>("PLAID_WEBHOOK_URL") || undefined;
    this.client = new PlaidApi(
      new Configuration({
        basePath: PlaidEnvironments[env],
        baseOptions: {
          headers: {
            "PLAID-CLIENT-ID": config.get<string>("PLAID_CLIENT_ID") ?? "",
            "PLAID-SECRET": config.get<string>("PLAID_SECRET") ?? "",
          },
        },
      }),
    );
  }

  /**
   * New connection: a link_token the frontend opens Plaid Link with.
   * Transactions is required; Investments and Liabilities are requested via
   * `required_if_supported_products` so institutions that support them grant the
   * extra data (holdings, loan/card detail), while depository-only banks still
   * link. Recurring transactions are derived from Transactions — no extra product.
   */
  async createLinkToken(userId: string) {
    const res = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: this.clientName,
      products: [Products.Transactions],
      required_if_supported_products: [Products.Investments, Products.Liabilities],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: this.webhookUrl,
    });
    return { linkToken: res.data.link_token, expiration: res.data.expiration };
  }

  /** Re-auth (update mode): pass an existing access_token, omit products. */
  async createUpdateLinkToken(userId: string, accessToken: string) {
    const res = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: this.clientName,
      country_codes: [CountryCode.Us],
      language: "en",
      access_token: accessToken,
      webhook: this.webhookUrl,
    });
    return { linkToken: res.data.link_token, expiration: res.data.expiration };
  }

  async exchangePublicToken(publicToken: string) {
    const res = await this.client.itemPublicTokenExchange({ public_token: publicToken });
    return { accessToken: res.data.access_token, itemId: res.data.item_id };
  }

  async getItemInstitution(accessToken: string): Promise<string | null> {
    const res = await this.client.itemGet({ access_token: accessToken });
    return res.data.item.institution_id ?? null;
  }

  async getInstitutionName(institutionId: string): Promise<string | null> {
    const res = await this.client.institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us],
    });
    return res.data.institution.name ?? null;
  }

  async getAccounts(accessToken: string): Promise<AccountBase[]> {
    const res = await this.client.accountsGet({ access_token: accessToken });
    return res.data.accounts;
  }

  async getBalances(accessToken: string): Promise<AccountBase[]> {
    const res = await this.client.accountsBalanceGet({ access_token: accessToken });
    return res.data.accounts;
  }

  async removeItem(accessToken: string): Promise<void> {
    await this.client.itemRemove({ access_token: accessToken });
  }

  /**
   * One page of `/transactions/sync`. Pass the saved cursor (undefined on the
   * first call) and loop while `has_more` is true, persisting `next_cursor`.
   */
  async transactionsSync(
    accessToken: string,
    cursor?: string,
  ): Promise<TransactionsSyncResponse> {
    const res = await this.client.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500,
    });
    return res.data;
  }

  /**
   * Current holdings for an item: `/investments/holdings/get` returns the
   * accounts, the positions (holdings), and the securities they reference.
   */
  async investmentsHoldings(accessToken: string): Promise<InvestmentsHoldingsGetResponse> {
    const res = await this.client.investmentsHoldingsGet({ access_token: accessToken });
    return res.data;
  }

  /**
   * One page of investment transactions over [startDate, endDate].
   * Unlike `/transactions/sync`, this is date-range + offset paginated; loop
   * while `offset + count < total_investment_transactions`.
   */
  async investmentsTransactions(
    accessToken: string,
    startDate: string,
    endDate: string,
    offset: number,
    count = 500,
  ): Promise<InvestmentsTransactionsGetResponse> {
    const res = await this.client.investmentsTransactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { offset, count },
    });
    return res.data;
  }

  /**
   * Liability detail (`/liabilities/get`): the accounts plus a `liabilities`
   * object with credit / student / mortgage arrays (APR, statement + due dates,
   * minimum payment).
   */
  async liabilities(accessToken: string): Promise<LiabilitiesGetResponse> {
    const res = await this.client.liabilitiesGet({ access_token: accessToken });
    return res.data;
  }

  /**
   * Recurring transaction streams (`/transactions/recurring/get`): detected
   * inflow + outflow streams (subscriptions, bills, paychecks). Derived from the
   * Transactions product, so it only works once transactions have been synced.
   */
  async transactionsRecurring(accessToken: string): Promise<TransactionsRecurringGetResponse> {
    const res = await this.client.transactionsRecurringGet({
      access_token: accessToken,
      options: { include_personal_finance_category: true },
    });
    return res.data;
  }

  /** Fetch the public key Plaid signed a webhook JWT with (verified in WebhookVerificationService). */
  async getWebhookVerificationKey(keyId: string): Promise<JWKPublicKey> {
    const res = await this.client.webhookVerificationKeyGet({ key_id: keyId });
    return res.data.key;
  }

  /** Sandbox-only: make Plaid POST a webhook to our configured URL (for testing the pipeline). */
  async sandboxFireWebhook(
    accessToken: string,
    code: SandboxItemFireWebhookRequestWebhookCodeEnum = SandboxItemFireWebhookRequestWebhookCodeEnum.SyncUpdatesAvailable,
  ): Promise<void> {
    await this.client.sandboxItemFireWebhook({ access_token: accessToken, webhook_code: code });
  }

  /**
   * Sandbox-only: mint a public_token without the frontend Link flow (for tests).
   * Includes Investments + Liabilities so the sandbox item carries holdings,
   * investment transactions, and loan/card detail (ins_109508 supports them).
   * Recurring streams derive from Transactions, so no extra product is needed.
   */
  async sandboxCreatePublicToken(institutionId = "ins_109508"): Promise<string> {
    const res = await this.client.sandboxPublicTokenCreate({
      institution_id: institutionId,
      initial_products: [Products.Transactions, Products.Investments, Products.Liabilities],
    });
    return res.data.public_token;
  }
}
