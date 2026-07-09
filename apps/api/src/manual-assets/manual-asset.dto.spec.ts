import { ManualAsset, Prisma } from "@prisma/client";
import { toManualAssetDto } from "./manual-asset.dto";

function fakeRow(over: Partial<ManualAsset> = {}): ManualAsset {
  return {
    id: "asset-1",
    userId: "user-1",
    name: "Rental House",
    kind: "asset",
    category: "real_estate",
    currentValue: new Prisma.Decimal("450000.0000"),
    currency: "USD",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date("2026-07-08T00:00:00.000Z"),
    ...over,
  } as ManualAsset;
}

describe("toManualAssetDto", () => {
  it("stringifies the decimal value and ISO-formats updatedAt", () => {
    const dto = toManualAssetDto(fakeRow());
    expect(dto.currentValue).toBe("450000");
    expect(dto.kind).toBe("asset");
    expect(dto.category).toBe("real_estate");
    expect(dto.updatedAt).toBe("2026-07-08T00:00:00.000Z");
  });

  it("passes null notes through", () => {
    const dto = toManualAssetDto(fakeRow({ notes: null }));
    expect(dto.notes).toBeNull();
  });
});
