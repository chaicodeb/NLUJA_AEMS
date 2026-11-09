"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { Button, Input, Label, Callout } from "@/components/ui";
import { useT } from "@/components/i18n";
import { loginAction, quickLoginAction, verifyOtpAction, type LoginState } from "./actions";

type DemoAccount = { email: string; name: string; role: string; roleLabel: string; designation: string | null; mfaEnabled: boolean };

export function LoginPanel({ demoAccounts, demoPassword, demoOtp }: { demoAccounts: DemoAccount[]; demoPassword: string; demoOtp: string }) {
  const t = useT();
  const [loginState, login, loggingIn] = useActionState<LoginState, FormData>(loginAction, undefined);
  const [quickState, quick, quickPending] = useActionState<LoginState, FormData>(quickLoginAction, undefined);
  const [otpState, verify, verifying] = useActionState<LoginState, FormData>(verifyOtpAction, undefined);
  const [tab, setTab] = useState<"demo" | "password">("demo");

  const mfa = otpState?.mfa ?? quickState?.mfa ?? loginState?.mfa;
  const error = otpState?.error ?? quickState?.error ?? loginState?.error;

  if (mfa && !otpState?.error?.includes("expired")) {
    return (
      <div className="w-full max-w-md">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h2 className="font-serif text-2xl font-bold">{t("Two-factor verification")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("{name} holds an examination-critical role. Enter the one-time password sent to {phone}.", { name: mfa.name, phone: mfa.maskedPhone })}
        </p>
        <form action={verify} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="otp">{t("One-time password")}</Label>
            <Input id="otp" name="otp" inputMode="numeric" autoFocus maxLength={6} placeholder={t("6-digit code")} className="h-11 text-center text-lg tracking-[0.5em]" />
          </div>
          {otpState?.error && <Callout tone="red">{t.loose(otpState.error)}</Callout>}
          <Button type="submit" size="lg" className="w-full" disabled={verifying}>
            {verifying ? t("Verifying…") : t("Verify & sign in")}
          </Button>
        </form>
        <Callout tone="amber" title={t("Demo OTP")}>
          {t("Use {otp}. Any other code is rejected and logged in the audit trail.", { otp: demoOtp })}
        </Callout>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl">
      <div className="mb-6 flex items-center gap-3 lg:hidden">
        <Image src="/brand/footer_logo.webp" alt="NLUJA emblem" width={44} height={44} />
        <div className="font-serif font-semibold">{t("NLUJA, Assam — AEMS")}</div>
      </div>
      <h2 className="font-serif text-2xl font-bold">{t("Sign in")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("Single sign-on with the University's Google Workspace / Microsoft 365 is supported in production (SAML 2.0 / OAuth 2.0).")}</p>

      <div className="mt-5 inline-flex rounded-lg bg-muted p-1 text-sm">
        {(["demo", "password"] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`rounded-md px-3 py-1.5 font-medium ${tab === tb ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
            {tb === "demo" ? t("Demo accounts") : t("Email & password")}
          </button>
        ))}
      </div>

      {error && <div className="mt-4"><Callout tone="red">{t.loose(error)}</Callout></div>}

      {tab === "demo" ? (
        <form action={quick} className="mt-5 grid gap-2 sm:grid-cols-2">
          {demoAccounts.map((u) => (
            <button
              key={u.email}
              name="email"
              value={u.email}
              disabled={quickPending}
              className="group flex items-start gap-3 rounded-lg border border-border bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-60"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 group-hover:bg-brand-100">
                <UserRound className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  {u.roleLabel}
                  {u.mfaEnabled && <KeyRound className="h-3.5 w-3.5 text-brand-600" aria-label={t("Two-factor")} />}
                </div>
                <div className="truncate text-xs text-muted-foreground">{u.name}</div>
              </div>
            </button>
          ))}
        </form>
      ) : (
        <form action={login} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("University email")}</Label>
            <Input id="email" name="email" type="email" defaultValue="coe@nluassam.ac.in" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("Password")}</Label>
            <Input id="password" name="password" type="password" defaultValue={demoPassword} required />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loggingIn}>
            {loggingIn ? t("Signing in…") : t("Sign in")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("All demo accounts use the password {password}.", { password: demoPassword })}</p>
        </form>
      )}
      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5" /> {t("Roles marked with a key require a second factor (OTP).")}
      </p>
    </div>
  );
}
