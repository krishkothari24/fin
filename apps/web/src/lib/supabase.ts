import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  console.warn(
    "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set — auth will not work until you copy .env.example to .env and fill them in.",
  );
}

// Fall back to placeholders so the client can construct without a real project configured yet;
// requests will simply fail until real credentials are provided.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  publishableKey || "placeholder-publishable-key",
);
