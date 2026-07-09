import { BrowserRouter, Routes, Route } from "react-router";
import { SignInRoute } from "@/routes/sign-in";
import { AppShell } from "@/routes/app-shell";
import { DashboardRoute } from "@/routes/dashboard";
import { AccountsRoute } from "@/routes/accounts";
import { TransactionsRoute } from "@/routes/transactions";
import { InvestmentsRoute } from "@/routes/investments";
import { SettingsRoute } from "@/routes/settings";
import { NetWorthRoute } from "@/routes/net-worth";
import { SpendingRoute } from "@/routes/spending";
import { CashFlowRoute } from "@/routes/cash-flow";
import { LiabilitiesRoute } from "@/routes/liabilities";
import { RecurringRoute } from "@/routes/recurring";
import { ManualAssetsRoute } from "@/routes/manual-assets";
import { BudgetsRoute } from "@/routes/budgets";
import { GoalsRoute } from "@/routes/goals";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignInRoute />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardRoute />} />
          <Route path="/accounts" element={<AccountsRoute />} />
          <Route path="/transactions" element={<TransactionsRoute />} />
          <Route path="/investments" element={<InvestmentsRoute />} />
          <Route path="/net-worth" element={<NetWorthRoute />} />
          <Route path="/spending" element={<SpendingRoute />} />
          <Route path="/cash-flow" element={<CashFlowRoute />} />
          <Route path="/liabilities" element={<LiabilitiesRoute />} />
          <Route path="/recurring" element={<RecurringRoute />} />
          <Route path="/manual-assets" element={<ManualAssetsRoute />} />
          <Route path="/budgets" element={<BudgetsRoute />} />
          <Route path="/goals" element={<GoalsRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
