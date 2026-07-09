import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/providers/auth-provider";
import { useItems } from "@/lib/queries";
import { Sidebar } from "@/components/layout/sidebar";
import { StatusBanner } from "@/components/layout/status-banner";
import { OnboardingRoute } from "@/routes/onboarding";

// Reachable even with zero connected Plaid items — these don't depend on synced data.
const NO_ITEMS_REQUIRED_PATHS = ["/manual-assets", "/goals", "/settings"];

export function AppShell() {
  const { session, loading } = useAuth();
  const { data: items, isLoading: itemsLoading } = useItems();
  const location = useLocation();

  if (loading) return null;
  if (!session) return <Navigate to="/sign-in" replace />;

  const skipOnboarding = NO_ITEMS_REQUIRED_PATHS.includes(location.pathname);
  if (!skipOnboarding && !itemsLoading && items && items.length === 0) {
    return <OnboardingRoute />;
  }

  return (
    <div className="flex h-screen bg-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <StatusBanner />
        <main className="flex-1 overflow-y-auto px-7 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
