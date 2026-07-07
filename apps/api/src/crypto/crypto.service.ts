import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM encryption for Plaid access tokens at rest.
 *
 * Ciphertext format: `iv.tag.data` (all base64). The GCM auth tag means a
 * tampered ciphertext fails to decrypt rather than returning garbage. The key
 * comes from ENCRYPTION_KEY (32 bytes, base64 — `openssl rand -base64 32`).
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>("ENCRYPTION_KEY") ?? "";
    this.key = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  }

  private assertKey(): void {
    if (this.key.length !== 32) {
      throw new Error(
        "ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).",
      );
    }
  }

  encrypt(plaintext: string): string {
    this.assertKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
  }

  decrypt(payload: string): string {
    this.assertKey();
    const [ivB64, tagB64, dataB64] = payload.split(".");
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error("Malformed ciphertext");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
