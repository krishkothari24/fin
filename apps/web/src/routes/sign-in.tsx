import { useState } from "react";
import { Navigate } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export function SignInRoute() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  const isSignUp = mode === "sign-up";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    if (isSignUp) {
      const { data, error: authError } = await supabase.auth.signUp({ email, password });
      setSubmitting(false);
      if (authError) setError(authError.message);
      else if (!data.session) setInfo("Account created — check your email to confirm it before signing in.");
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (authError) setError(authError.message);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg px-4">
      <Logo />
      <div className="w-full max-w-[380px] rounded-[14px] border border-border-subtle bg-surface p-6">
        <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-[13.5px] font-medium text-text-secondary">
          {isSignUp
            ? "Connect your accounts and see where you stand."
            : "Sign in to see your finances at a glance."}
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field label="Email">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </Field>
          {isSignUp && (
            <Field label="Confirm password">
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
              />
            </Field>
          )}

          {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
          {info && <p className="text-[13px] font-medium text-text-secondary">{info}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-[10px] bg-accent py-2.5 text-[13.5px] font-semibold text-bg transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {submitting ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-[13px] font-medium text-text-secondary">
          {isSignUp ? "Already have an account? " : "Don't have an account? "}
          <button
            type="button"
            className="font-semibold text-accent hover:text-accent-hover"
            onClick={() => {
              setError(null);
              setInfo(null);
              setMode(isSignUp ? "sign-in" : "sign-up");
            }}
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent">
        <span className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-bg" />
      </span>
      <span className="text-[16px] font-bold text-text-primary">fin</span>
    </div>
  );
}
