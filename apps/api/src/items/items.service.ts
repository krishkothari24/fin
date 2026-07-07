import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { AccountBase } from "plaid";
import { CryptoService } from "../crypto/crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { PlaidService } from "../plaid/plaid.service";
import { QueueService } from "../sync/queue.service";
import { mapPlaidAccount } from "./account.mapper";

/**
 * Item lifecycle orchestration: connect (exchange + encrypt + store), list,
 * re-auth, refresh balances, and remove. The Plaid access_token only ever exists
 * decrypted inside a single method call — at rest it is AES-GCM ciphertext.
 */
@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    private readonly plaid: PlaidService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly queue: QueueService,
  ) {}

  /** Create a link_token for a brand-new connection. */
  createLinkToken(userId: string) {
    return this.plaid.createLinkToken(userId);
  }

  /** Exchange the Link public_token, store the Item (encrypted) + its accounts. */
  async exchangeAndStore(userId: string, publicToken: string) {
    const { accessToken, itemId } = await this.plaid.exchangePublicToken(publicToken);
    const institutionId = await this.plaid.getItemInstitution(accessToken);
    const institutionName = institutionId
      ? await this.plaid.getInstitutionName(institutionId)
      : null;

    await this.ensureProfile(userId);
    const item = await this.prisma.plaidItem.create({
      data: {
        userId,
        plaidItemId: itemId,
        accessTokenCiphertext: this.crypto.encrypt(accessToken),
        institutionId,
        institutionName,
      },
    });

    const accounts = await this.plaid.getAccounts(accessToken);
    await this.storeAccounts(item.id, accounts);

    // Kick off the initial transaction pull + investments pull in the background.
    await this.queue.enqueueSync(item.id);
    await this.queue.enqueueInvestmentsSync(item.id);
    return { itemId: item.id, institutionName, accountsConnected: accounts.length };
  }

  async listItems(userId: string) {
    const items = await this.prisma.plaidItem.findMany({
      where: { userId },
      include: { accounts: true },
      orderBy: { createdAt: "desc" },
    });
    return items.map((i) => ({
      id: i.id,
      institutionName: i.institutionName,
      status: i.status,
      lastSyncedAt: i.lastSyncedAt,
      accounts: i.accounts.length,
    }));
  }

  async createReauthLinkToken(userId: string, itemId: string) {
    const item = await this.requireItem(userId, itemId);
    const accessToken = this.crypto.decrypt(item.accessTokenCiphertext);
    return this.plaid.createUpdateLinkToken(userId, accessToken);
  }

  async refreshBalances(userId: string, itemId: string) {
    const item = await this.requireItem(userId, itemId);
    const accessToken = this.crypto.decrypt(item.accessTokenCiphertext);
    const accounts = await this.plaid.getBalances(accessToken);
    await this.storeAccounts(item.id, accounts);
    return { refreshed: accounts.length };
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.requireItem(userId, itemId);
    const accessToken = this.crypto.decrypt(item.accessTokenCiphertext);
    try {
      await this.plaid.removeItem(accessToken);
    } catch (err) {
      // Still purge locally even if Plaid's remove call fails.
      this.logger.warn(`Plaid item/remove failed, purging local anyway: ${String(err)}`);
    }
    await this.prisma.plaidItem.delete({ where: { id: item.id } });
    return { removed: true };
  }

  // --- helpers -------------------------------------------------------------

  private async ensureProfile(userId: string) {
    await this.prisma.profile.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });
  }

  private async storeAccounts(itemId: string, accounts: AccountBase[]) {
    for (const a of accounts) {
      const data = mapPlaidAccount(itemId, a);
      await this.prisma.account.upsert({
        where: { plaidAccountId: data.plaidAccountId },
        create: data,
        update: {
          name: data.name,
          officialName: data.officialName,
          currentBalance: data.currentBalance,
          availableBalance: data.availableBalance,
          currency: data.currency,
        },
      });
    }
  }

  private async requireItem(userId: string, itemId: string) {
    const item = await this.prisma.plaidItem.findFirst({ where: { id: itemId, userId } });
    if (!item) throw new NotFoundException("Item not found");
    return item;
  }
}
