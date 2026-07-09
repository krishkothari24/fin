import { Link } from "react-router";
import { usePlaidConnect } from "@/hooks/use-plaid-connect";

export function OnboardingRoute() {
  const { connect, starting, connecting } = usePlaidConnect();

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-bg px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15">
        <span className="h-5 w-5 rotate-45 rounded-[3px] border-2 border-accent" />
      </div>
      <div className="max-w-[460px] text-center">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">
          Connect your first account
        </h1>
        <p className="mt-2 text-[13.5px] font-medium text-text-secondary">
          Link a bank, credit card, or investment account to see your net worth, spending, and
          cash flow in one place.
        </p>
        <ul className="mt-5 flex flex-col gap-2 text-left text-[13px] font-medium text-text-secondary">
          <li>• Read-only — we never move money or place trades</li>
          <li>• Instant net worth, spending, and cash flow once synced</li>
          <li>• Connect multiple institutions</li>
        </ul>
      </div>
      <button
        type="button"
        disabled={starting || connecting}
        onClick={connect}
        className="rounded-[10px] bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-bg hover:bg-accent-hover disabled:opacity-60"
      >
        {connecting ? "Connecting…" : starting ? "Preparing…" : "Connect an account"}
      </button>
      <Link to="/manual-assets" className="text-[12.5px] font-medium text-text-muted hover:text-text-secondary">
        Or track assets & liabilities manually, without connecting a bank →
      </Link>
    </div>
  );
}
