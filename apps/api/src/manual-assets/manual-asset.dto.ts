import { ManualAsset } from "@prisma/client";
import { ManualAssetDto, ManualAssetCategory, ManualAssetKind } from "@fin/shared";

/** Map a persisted ManualAsset to the API DTO. Pure. */
export function toManualAssetDto(m: ManualAsset): ManualAssetDto {
  return {
    id: m.id,
    name: m.name,
    kind: m.kind as ManualAssetKind,
    category: m.category as ManualAssetCategory,
    currentValue: m.currentValue.toString(),
    currency: m.currency,
    notes: m.notes,
    updatedAt: m.updatedAt.toISOString(),
  };
}
