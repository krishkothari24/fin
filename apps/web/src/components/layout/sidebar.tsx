import { NavLink } from "react-router";
import { useAuth } from "@/providers/auth-provider";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/" },
  { label: "Accounts", to: "/accounts" },
  { label: "Transactions", to: "/transactions" },
  { label: "Net Worth", to: "/net-worth" },
  { label: "Spending", to: "/spending" },
  { label: "Cash Flow", to: "/cash-flow" },
  { label: "Investments", to: "/investments" },
  { label: "Liabilities", to: "/liabilities" },
  { label: "Recurring", to: "/recurring" },
  { label: "Assets & Liabilities", to: "/manual-assets" },
  { label: "Budgets", to: "/budgets" },
  { label: "Goals", to: "/goals" },
  { label: "Settings", to: "/settings" },
];

export function Sidebar() {
  const { session } = useAuth();
  const email = session?.user.email ?? "";
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <aside className="flex h-screen w-[248px] shrink-0 flex-col border-r border-border-subtle bg-bg-sidebar">
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="relative flex h-[26px] w-[26px] items-center justify-center rounded-full bg-accent">
          <span className="h-2 w-2 rotate-45 rounded-[1.5px] bg-bg" />
        </span>
        <span className="text-[16px] font-bold text-text-primary">fin</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors ${
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-border-subtle px-4 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-text-primary">
          {initials || "?"}
        </span>
        <div className="flex flex-col overflow-hidden">
          <span className="truncate text-[13px] font-semibold text-text-primary">{email}</span>
          <span className="text-[11px] font-medium text-text-muted">Signed in</span>
        </div>
      </div>
    </aside>
  );
}
