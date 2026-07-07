import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { CryptoService } from "./crypto.service";

/** Build a CryptoService with a given ENCRYPTION_KEY (no Nest container needed). */
function make(key: string): CryptoService {
  return new CryptoService({ get: () => key } as unknown as ConfigService);
}

describe("CryptoService", () => {
  const key = randomBytes(32).toString("base64");
  const svc = make(key);

  it("round-trips a value and never stores it in cleartext", () => {
    const secret = "access-sandbox-abc123";
    const ct = svc.encrypt(secret);
    expect(ct).not.toContain(secret);
    expect(svc.decrypt(ct)).toBe(secret);
  });

  it("uses a fresh IV each time (same input -> different ciphertext)", () => {
    expect(svc.encrypt("x")).not.toEqual(svc.encrypt("x"));
  });

  it("rejects a tampered ciphertext (GCM auth tag)", () => {
    const [iv, tag] = svc.encrypt("hello").split(".");
    const tampered = `${iv}.${tag}.${Buffer.from("garbage").toString("base64")}`;
    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it("throws a clear error when the key is missing/wrong size", () => {
    expect(() => make("").encrypt("x")).toThrow(/ENCRYPTION_KEY/);
  });
});
