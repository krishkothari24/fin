import { Injectable, Logger } from "@nestjs/common";
import { createHash, timingSafeEqual } from "crypto";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { JWKPublicKey } from "plaid";
import { PlaidService } from "../plaid/plaid.service";

/**
 * Verifies Plaid webhook authenticity. Plaid signs every webhook with an ES256
 * JWT in the `Plaid-Verification` header. A webhook is trusted only if:
 *   1. the JWT is ES256-signed by the key Plaid names (its `kid`),
 *   2. the token is fresh (issued within the last 5 minutes — replay defense),
 *   3. sha256(raw request body) equals the JWT's `request_body_sha256` claim.
 *
 * Computing (3) is why the webhook route needs the *raw* body, not the parsed JSON.
 */
@Injectable()
export class WebhookVerificationService {
  private readonly logger = new Logger(WebhookVerificationService.name);
  private readonly keyCache = new Map<string, JWKPublicKey>();

  constructor(private readonly plaid: PlaidService) {}

  async verify(verificationHeader: string | undefined, rawBody: Buffer): Promise<boolean> {
    if (!verificationHeader) return false;

    let kid: string;
    try {
      const header = decodeProtectedHeader(verificationHeader);
      if (header.alg !== "ES256" || !header.kid) return false;
      kid = header.kid;
    } catch {
      return false;
    }

    const jwk = await this.getKey(kid);
    if (!jwk) return false;

    try {
      const key = await importJWK({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, "ES256");
      const { payload } = await jwtVerify(verificationHeader, key, {
        algorithms: ["ES256"],
        maxTokenAge: "5 min",
      });
      const claimed = (payload as Record<string, unknown>)["request_body_sha256"];
      if (typeof claimed !== "string") return false;
      const actual = createHash("sha256").update(rawBody).digest("hex");
      return safeEqual(claimed, actual);
    } catch (err) {
      this.logger.warn(`webhook JWT verification failed: ${String(err)}`);
      return false;
    }
  }

  private async getKey(kid: string): Promise<JWKPublicKey | null> {
    const cached = this.keyCache.get(kid);
    if (cached) return cached;
    try {
      const key = await this.plaid.getWebhookVerificationKey(kid);
      this.keyCache.set(kid, key);
      return key;
    } catch (err) {
      this.logger.warn(`could not fetch webhook verification key ${kid}: ${String(err)}`);
      return null;
    }
  }
}

/** Constant-time string compare (both are hex digests of equal length when valid). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
