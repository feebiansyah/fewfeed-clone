"use client";

import { useActionState } from "react";

import { login, type LoginState } from "@/app/login/actions";

const initialState: LoginState = {};

const errorMessages: Record<NonNullable<LoginState["error"]>, string> = {
  INVALID_CREDENTIALS: "Invalid email or password.",
  ACCOUNT_DISABLED: "This account is disabled.",
};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <p className="auth-eyebrow">Internal Access</p>
        <h1 id="login-title">Fewfeed Clone</h1>
        <form action={formAction} className="auth-form">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          {state.error ? (
            <p className="auth-error" role="alert" aria-live="polite">
              {errorMessages[state.error]}
            </p>
          ) : null}
          <button type="submit" disabled={pending}>
            {pending ? "Logging in..." : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}
