"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { Button, Input, Label, Callout } from "@/components/ui";
import { useT } from "@/components/i18n";
import type { SignInVersion } from "@/lib/auth/versions";
import { quickLoginAction, verifyOtpAction, type LoginState } from "./actions";

type DemoAccount = { email: string; name: string; role: string; roleLabel: string; designation: string | null; mfaEnabled: boolean };
type Mfa = { name: string; maskedPhone: string; minutes?: number };

const REMEMBER_KEY = "nluja_signin_email";

/** Calls the sign-in API of the given version and returns the parsed reply. */
async function callApi(version: SignInVersion, step: "login" | "otp", body: Record<string, string>) {
  const res = await fetch(`/api/${version}/auth/${step}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json()) as Record<string, unknown> & {
    status?: string; next?: string; message?: string; result?: string;
    user?: { name: string }; otp?: { sentTo: string; expiresInSeconds: number }; error?: { code: string; message: string };
  };
}

export function LoginPanel({ demoAccounts, demoPassword, demoOtp, version, live, signedInAs }: {
  demoAccounts: DemoAccount[]; demoPassword: string; demoOtp: string; version: SignInVersion; live: SignInVersion; signedInAs: string | null;
}) {
  const t = useT();
  const [quickState, quick, quickPending] = useActionState<LoginState, FormData>(quickLoginAction, undefined);
  const [otpState, verify, verifying] = useActionState<LoginState, FormData>(verifyOtpAction, undefined);
  const [tab, setTab] = useState<"demo" | "password">("demo");
  const [apiMfa, setApiMfa] = useState<Mfa | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  if (apiMfa) return <ApiOtp version={version} mfa={apiMfa} demoOtp={demoOtp} onExpired={(msg) => { setApiMfa(null); setApiError(msg); }} />;

  const mfa = otpState?.mfa ?? quickState?.mfa;
  const error = apiError ?? otpState?.error ?? quickState?.error;

  if (mfa && !otpState?.error?.includes("expired")) {
    return (
      <OtpScreen mfa={mfa} demoOtp={demoOtp} error={otpState?.error} busy={verifying} formProps={{ action: verify }} />
    );
  }

  return (
    <div className="w-full max-w-xl">
      <div className="mb-6 flex items-center gap-3 lg:hidden">
        <Image src="/brand/footer_logo.webp" alt="NLUJA emblem" width={44} height={44} />
        <div className="font-serif font-semibold">{t("NLUJA, Assam — AEMS")}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-2xl font-bold">{t("Sign in")}</h2>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${version === "v2" ? "border-leaf-200 bg-leaf-50 text-leaf-700" : "border-border bg-muted text-muted-foreground"}`} data-signin-version={version}>
          {t("Sign-in {version}", { version })}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("Single sign-on with the University's Google Workspace / Microsoft 365 is supported in production (SAML 2.0 / OAuth 2.0).")}</p>
      {(version !== live || signedInAs) && (
        <div className="mt-3">
          <Callout tone="blue">
            {version !== live && <div>{t("Preview of sign-in {version}. The version in use is {live}.", { version, live })}</div>}
            {signedInAs && (
              <div>
                {t("You are already signed in as {name}; this is a preview of the sign-in page.", { name: signedInAs })}{" "}
                <Link href="/dashboard" className="font-medium underline">{t("Back to dashboard")}</Link>
              </div>
            )}
          </Callout>
        </div>
      )}

      <div className="mt-5 inline-flex rounded-lg bg-muted p-1 text-sm">
        {(["demo", "password"] as const).map((tb) => (
          <button key={tb} onClick={() => { setTab(tb); setApiError(null); }} className={`rounded-md px-3 py-1.5 font-medium ${tab === tb ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
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
      ) : version === "v1" ? (
        <PasswordFormV1 demoPassword={demoPassword} onMfa={setApiMfa} onError={setApiError} />
      ) : (
        <PasswordFormV2 demoPassword={demoPassword} onMfa={setApiMfa} onError={setApiError} />
      )}
      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5" /> {t("Roles marked with a key require a second factor (OTP).")}
      </p>
    </div>
  );
}

type FormProps = { demoPassword: string; onMfa: (m: Mfa) => void; onError: (e: string | null) => void };

function useSubmit(onError: FormProps["onError"]) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await fn();
    } catch {
      onError(t("Could not reach the server. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** v1: one form, calls POST /api/v1/auth/login. */
function PasswordFormV1({ demoPassword, onMfa, onError }: FormProps) {
  const t = useT();
  const [email, setEmail] = useState("coe@nluassam.ac.in");
  const [password, setPassword] = useState(demoPassword);
  const { busy, run } = useSubmit(onError);
  const submit = run(async () => {
    const r = await callApi("v1", "login", { email, password });
    if (r.status === "ok" && r.next) return window.location.assign(r.next);
    if (r.status === "otp_required") return onMfa({ name: email, maskedPhone: t("your registered mobile number") });
    onError(r.message ?? "Invalid email or password.");
  });
  return (
    <form onSubmit={submit} className="mt-5 space-y-4" data-signin-form="v1">
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("University email")}</Label>
        <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("Password")}</Label>
        <Input id="password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t("Signing in…") : t("Sign in")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("All demo accounts use the password {password}.", { password: demoPassword })}</p>
    </form>
  );
}

/** v2: email first, then password with show/hide; calls POST /api/v2/auth/login. */
function PasswordFormV2({ demoPassword, onMfa, onError }: FormProps) {
  const t = useT();
  const [remembered] = useState(() => window.localStorage.getItem(REMEMBER_KEY));
  const [email, setEmail] = useState(remembered ?? "coe@nluassam.ac.in");
  const [remember, setRemember] = useState(!!remembered);
  const [step, setStep] = useState<"email" | "password">("email");
  const [password, setPassword] = useState(demoPassword);
  const [show, setShow] = useState(false);
  const { busy, run } = useSubmit(onError);

  const toPassword = (e: FormEvent) => {
    e.preventDefault();
    if (remember) window.localStorage.setItem(REMEMBER_KEY, email.trim());
    else window.localStorage.removeItem(REMEMBER_KEY);
    onError(null);
    setStep("password");
  };
  const submit = run(async () => {
    const r = await callApi("v2", "login", { email, password });
    if (r.result === "SIGNED_IN" && r.next) return window.location.assign(r.next);
    if (r.result === "OTP_REQUIRED" && r.user && r.otp) return onMfa({ name: r.user.name, maskedPhone: r.otp.sentTo, minutes: Math.round(r.otp.expiresInSeconds / 60) });
    onError(r.error?.message ?? "Invalid email or password.");
  });

  if (step === "email")
    return (
      <form onSubmit={toPassword} className="mt-5 space-y-4" data-signin-form="v2-email">
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("University email")}</Label>
          <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t("Remember my email on this device")}
        </label>
        <Button type="submit" size="lg" className="w-full">{t("Continue")}</Button>
      </form>
    );

  return (
    <form onSubmit={submit} className="mt-5 space-y-4" data-signin-form="v2-password">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <UserRound className="h-4 w-4 shrink-0 text-brand-700" />
          <span className="truncate font-medium">{email}</span>
        </span>
        <button type="button" onClick={() => setStep("email")} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
          <ArrowLeft className="h-3 w-3" /> {t("Change")}
        </button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("Password")}</Label>
        <div className="relative">
          <Input id="password" name="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus className="pr-10" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={show ? t("Hide password") : t("Show password")}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t("Signing in…") : t("Sign in")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("All demo accounts use the password {password}.", { password: demoPassword })}</p>
    </form>
  );
}

/** Second factor after an API sign-in; posts to the same API version. */
function ApiOtp({ version, mfa, demoOtp, onExpired }: { version: SignInVersion; mfa: Mfa; demoOtp: string; onExpired: (msg: string) => void }) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmit(setError);
  const submit = run(async () => {
    const r = await callApi(version, "otp", { otp });
    if ((r.status === "ok" || r.result === "SIGNED_IN") && r.next) return window.location.assign(r.next);
    const message = r.message ?? r.error?.message ?? "Incorrect one-time password.";
    if (r.error?.code === "OTP_EXPIRED" || message.includes("expired")) return onExpired(message);
    setError(message);
  });
  return <OtpScreen mfa={mfa} demoOtp={demoOtp} error={error} busy={busy} formProps={{ onSubmit: submit }} otp={otp} onOtp={setOtp} />;
}

function OtpScreen({ mfa, demoOtp, error, busy, formProps, otp, onOtp }: {
  mfa: Mfa; demoOtp: string; error?: string | null; busy: boolean;
  formProps: { action?: (fd: FormData) => void; onSubmit?: (e: FormEvent) => void };
  otp?: string; onOtp?: (v: string) => void;
}) {
  const t = useT();
  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h2 className="font-serif text-2xl font-bold">{t("Two-factor verification")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("{name} holds an examination-critical role. Enter the one-time password sent to {phone}.", { name: mfa.name, phone: mfa.maskedPhone })}
        {mfa.minutes ? ` ${t("The code is valid for {minutes} minutes.", { minutes: mfa.minutes })}` : ""}
      </p>
      <form {...formProps} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="otp">{t("One-time password")}</Label>
          <Input
            id="otp" name="otp" inputMode="numeric" autoFocus maxLength={6} placeholder={t("6-digit code")} className="h-11 text-center text-lg tracking-[0.5em]"
            {...(onOtp ? { value: otp, onChange: (e: ChangeEvent<HTMLInputElement>) => onOtp(e.target.value) } : {})}
          />
        </div>
        {error && <Callout tone="red">{t.loose(error)}</Callout>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? t("Verifying…") : t("Verify & sign in")}
        </Button>
      </form>
      <Callout tone="amber" title={t("Demo OTP")}>
        {t("Use {otp}. Any other code is rejected and logged in the audit trail.", { otp: demoOtp })}
      </Callout>
    </div>
  );
}
