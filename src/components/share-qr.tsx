import { Smartphone } from "lucide-react";
import { qrDataUrl, shareUrl } from "@/lib/share";

const NOTE = {
  public: "Scan to open this demo on your phone.",
  network: "Scan with a phone on the same Wi-Fi network.",
  local: "Only this computer can open this address — share the hosted link instead.",
};

/** QR code for the address others should use to open the demo. */
export async function ShareQr({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  const { url, kind } = await shareUrl();
  const src = await qrDataUrl(url);
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${dark ? "border-white/15 bg-white/5" : "border-border bg-white"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the server */}
      <img src={src} alt={`QR code for ${url}`} width={compact ? 72 : 96} height={compact ? 72 : 96} className="shrink-0 rounded bg-white p-1" />
      <div className="min-w-0 text-xs leading-snug">
        <div className={`flex items-center gap-1 font-medium ${dark ? "text-white" : "text-foreground"}`}>
          <Smartphone className="h-3.5 w-3.5" /> Open on your phone
        </div>
        <div className={dark ? "text-white/60" : "text-muted-foreground"}>{NOTE[kind]}</div>
        <div className={`mt-1 break-all font-mono text-[11px] ${dark ? "text-white/80" : "text-foreground"}`}>{url.replace(/^https?:\/\//, "")}</div>
      </div>
    </div>
  );
}
