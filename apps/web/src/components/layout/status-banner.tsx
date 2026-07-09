import { useItems } from "@/lib/queries";
import { useReauth } from "@/hooks/use-reauth";

export function StatusBanner() {
  const { data: items } = useItems();
  const { reauth, preparingItemId, activeItemId } = useReauth();

  const troubled = items?.find((item) => item.status !== "good");
  if (!troubled) return null;

  const reauthing = preparingItemId === troubled.id || activeItemId === troubled.id;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-alert/20 bg-alert/10 px-7 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alert" />
        <p className="text-[13px] font-medium text-alert">
          {troubled.institutionName ?? "An account"} needs to be reconnected — its data may be out
          of date.
        </p>
      </div>
      <button
        type="button"
        disabled={reauthing}
        onClick={() => reauth(troubled.id)}
        className="shrink-0 rounded-md bg-alert px-3 py-1.5 text-[12.5px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
      >
        {reauthing ? "Preparing…" : "Reconnect"}
      </button>
    </div>
  );
}
