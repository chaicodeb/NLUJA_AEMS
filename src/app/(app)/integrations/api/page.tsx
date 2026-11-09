import { requirePage } from "@/lib/session";
import { RATE_LIMIT_PER_MINUTE, SCOPES, apiActivity } from "@/lib/integrations/api";
import { ENDPOINTS } from "@/lib/integrations/openapi";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { SIGNIN_VERSIONS, V1_SUNSET, type SignInVersion } from "@/lib/auth/versions";
import { signInVersionOverview } from "@/lib/auth/api";
import { CreateKeyForm, RevokeKeyButton, SignInVersionSwitch, TryIt } from "../client";

const SAMPLE_REQUESTS: Record<SignInVersion, string> = {
  v1: JSON.stringify({ email: "coe@nluassam.ac.in", password: "••••••" }, null, 2),
  v2: JSON.stringify({ email: "coe@nluassam.ac.in", password: "••••••", captchaId: "eyJhbGciOi…", captchaAnswer: "48273" }, null, 2),
};

export default async function ApiPage() {
  await requirePage("/integrations/api");
  const [{ keys, calls }, versions] = await Promise.all([apiActivity(), signInVersionOverview()]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Partner API & keys"
        description={`Read-only REST API for other University systems (Samarth, library, hostel, NAD). Each system gets its own key with only the permissions it needs; every call is logged and limited to ${RATE_LIMIT_PER_MINUTE} a minute.`}
        actions={
          <div className="flex gap-4">
            <a href="/api/v1/openapi.json" target="_blank" className="text-sm font-medium text-brand-700 hover:underline">OpenAPI v1 (JSON)</a>
            <a href="/api/v2/openapi.json" target="_blank" className="text-sm font-medium text-brand-700 hover:underline">OpenAPI v2 (JSON)</a>
          </div>
        }
      />
      <Card>
        <CardHeader
          title="Versions — sign-in screen and sign-in API"
          description="Each version of the email-and-password sign-in has its own API version. Both run side by side: the Administrator chooses which one everyone sees and can switch back at any time; systems still calling the older API keep working until its announced sunset date."
        />
        <Table>
          <THead>
            <tr>
              <TH>Version</TH>
              <TH>Status</TH>
              <TH>Endpoints</TH>
              <TH className="text-right">Calls (7 days)</TH>
              <TH>Preview</TH>
              <TH className="text-right" />
            </tr>
          </THead>
          <tbody>
            {(Object.keys(SIGNIN_VERSIONS) as SignInVersion[]).map((v) => {
              const meta = SIGNIN_VERSIONS[v];
              const live = versions.live === v;
              return (
                <TR key={v}>
                  <TD>
                    <div className="font-medium">{meta.title}</div>
                    <div className="text-xs text-muted-foreground">API {meta.api} · released {formatDate(new Date(meta.released))}</div>
                  </TD>
                  <TD>
                    {live ? <Badge tone="green">In use</Badge> : v === "v1" ? <Badge tone="amber">Deprecated · sunset {formatDate(V1_SUNSET)}</Badge> : <Badge tone="blue">Available</Badge>}
                  </TD>
                  <TD className="font-mono text-xs">{meta.endpoints.map((e) => <div key={e}>{e}</div>)}</TD>
                  <TD className="text-right">{versions.calls[v]}</TD>
                  <TD><a href={`/login?version=${v}`} target="_blank" className="text-sm font-medium text-brand-700 hover:underline">Open sign-in {v}</a></TD>
                  <TD className="text-right"><SignInVersionSwitch version={v} live={live} /></TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
        <CardBody className="grid gap-5 border-t border-border lg:grid-cols-2">
          {(Object.keys(SIGNIN_VERSIONS) as SignInVersion[]).map((v) => (
            <div key={v} className="space-y-2">
              <div className="text-sm font-semibold">What a {v} sign-in request sends</div>
              <pre className="overflow-auto rounded-lg bg-ink-900 p-3 text-xs text-white/90">{SAMPLE_REQUESTS[v]}</pre>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">{SIGNIN_VERSIONS[v].changes.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          ))}
        </CardBody>
        <CardBody className="border-t border-border text-xs text-muted-foreground">
          <div className="mb-1 font-semibold text-foreground">Rules</div>
          Additions that do not break callers stay in the same version (1.0 → 1.1). A change that would break a caller gets a new version (2.0) running alongside the old one; every reply carries an <span className="font-mono">API-Version</span> header, and while v2 is in use v1 replies also carry <span className="font-mono">Deprecation</span>, <span className="font-mono">Sunset</span> and a link to v2.
          {versions.history.length > 0 && (
            <div className="mt-3 space-y-0.5">
              <div className="font-semibold text-foreground">Switch history</div>
              {versions.history.map((h) => <div key={h.id}>{formatDate(h.at, true)} · {h.actor?.name ?? "System"} · {h.summary}</div>)}
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Endpoints" description="Base URL is this server; authenticate with 'Authorization: Bearer <key>'." />
        <Table>
          <THead>
            <tr>
              <TH>Request</TH>
              <TH>Returns</TH>
              <TH>Permission</TH>
              <TH>Parameters</TH>
            </tr>
          </THead>
          <tbody>
            {ENDPOINTS.map((e) => (
              <TR key={e.path}>
                <TD className="font-mono text-xs"><Badge tone="blue">{e.method}</Badge> {e.path}</TD>
                <TD className="text-sm">{e.summary}</TD>
                <TD><span className="font-mono text-xs">{e.scope}</span></TD>
                <TD className="text-xs text-muted-foreground">{e.params}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Issue a key" />
          <CardBody><CreateKeyForm scopes={Object.entries(SCOPES)} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Try it" description="Calls the live API from your browser with the key you paste (your login session is not sent)." />
          <CardBody>
            <TryIt examples={ENDPOINTS.map((e) => ({ label: e.summary, path: e.example }))} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Keys" />
        <Table>
          <THead>
            <tr>
              <TH>System</TH>
              <TH>Key</TH>
              <TH>Permissions</TH>
              <TH>Usage</TH>
              <TH className="text-right" />
            </tr>
          </THead>
          <tbody>
            {keys.map((k) => (
              <TR key={k.id}>
                <TD>
                  <div className="font-medium">{k.name}</div>
                  <div className="text-xs text-muted-foreground">Created {formatDate(k.createdAt)}</div>
                </TD>
                <TD className="font-mono text-xs">{k.prefix}…</TD>
                <TD><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</div></TD>
                <TD className="text-xs text-muted-foreground">{k._count.calls} calls{k.lastUsedAt ? ` · last ${formatDate(k.lastUsedAt, true)}` : ""}</TD>
                <TD className="text-right">{k.revokedAt ? <Badge tone="red">Revoked {formatDate(k.revokedAt)}</Badge> : <RevokeKeyButton id={k.id} name={k.name} />}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Recent calls" />
        <Table>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Key</TH>
              <TH>Request</TH>
              <TH className="text-right">Status</TH>
              <TH className="text-right">Time</TH>
            </tr>
          </THead>
          <tbody>
            {calls.map((c) => (
              <TR key={c.id}>
                <TD className="text-xs">{formatDate(c.at, true)}</TD>
                <TD className="text-xs">{c.key ? c.key.name : /^\/api\/v\d\/auth\//.test(c.path) ? <span className="text-muted-foreground">sign-in (no key needed)</span> : <span className="text-muted-foreground">no / invalid key</span>}</TD>
                <TD className="font-mono text-xs">{c.method} {c.path}</TD>
                <TD className="text-right"><Badge tone={c.status < 300 ? "green" : c.status === 429 ? "amber" : "red"}>{c.status}</Badge></TD>
                <TD className="text-right text-xs">{c.ms} ms</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
