import { requirePage } from "@/lib/session";
import { RATE_LIMIT_PER_MINUTE, SCOPES, apiActivity } from "@/lib/integrations/api";
import { ENDPOINTS } from "@/lib/integrations/openapi";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { CreateKeyForm, RevokeKeyButton, TryIt } from "../client";

export default async function ApiPage() {
  await requirePage("/integrations/api");
  const { keys, calls } = await apiActivity();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Partner API & keys"
        description={`Read-only REST API for other University systems (Samarth, library, hostel, NAD). Each system gets its own key with only the permissions it needs; every call is logged and limited to ${RATE_LIMIT_PER_MINUTE} a minute.`}
        actions={<a href="/api/v1/openapi.json" target="_blank" className="text-sm font-medium text-brand-700 hover:underline">OpenAPI specification (JSON)</a>}
      />
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
                <TD className="text-xs">{c.key ? c.key.name : <span className="text-muted-foreground">no / invalid key</span>}</TD>
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
