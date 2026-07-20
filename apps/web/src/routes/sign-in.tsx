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

  async function handleGoogleSignIn() {
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/sign-in` },
    });
    if (authError) setError(authError.message);
  }

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

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-[10px] border border-border-subtle bg-surface py-2.5 text-[13.5px] font-semibold text-text-primary transition-colors hover:bg-bg"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-[12px] font-medium text-text-secondary">or</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
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

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
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
