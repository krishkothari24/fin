import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AccountBase,
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
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

  /** New connection: a link_token the frontend opens Plaid Link with. */
  async createLinkToken(userId: string) {
    const res = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: this.clientName,
      products: [Products.Transactions],
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

  /** Sandbox-only: mint a public_token without the frontend Link flow (for tests). */
  async sandboxCreatePublicToken(institutionId = "ins_109508"): Promise<string> {
    const res = await this.client.sandboxPublicTokenCreate({
      institution_id: institutionId,
      initial_products: [Products.Transactions],
    });
    return res.data.public_token;
  }
}
