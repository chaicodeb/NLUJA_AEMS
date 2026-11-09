import { Smartphone } from "lucide-react";
import { qrDataUrl, shareUrl } from "@/lib/share";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/messages";
import { QrZoom } from "./qr-zoom";

const NOTE: Record<string, MessageKey> = {
  public: "Scan to open this demo on your phone.",
  network: "Scan with a phone on the same Wi-Fi network.",
  local: "Only this computer can open this address — share the hosted link instead.",
};

/** QR code for the address others should use to open the demo. */
export async function ShareQr({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  const { url, kind } = await shareUrl();
  const src = await qrDataUrl(url);
  const t = await getT();
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${dark ? "border-white/15 bg-white/5" : "border-border bg-white"}`}>
      <QrZoom src={src} url={url} note={t(NOTE[kind])} size={compact ? 72 : 96} />
      <div className="min-w-0 text-xs leading-snug">
        <div className={`flex items-center gap-1 font-medium ${dark ? "text-white" : "text-foreground"}`}>
          <Smartphone className="h-3.5 w-3.5" /> {t("Open on your phone")}
        </div>
        <div className={dark ? "text-white/60" : "text-muted-foreground"}>{t(NOTE[kind])}</div>
        <div className={`mt-1 break-all font-mono text-[11px] ${dark ? "text-white/80" : "text-foreground"}`}>{url.replace(/^https?:\/\//, "")}</div>
      </div>
    </div>
  );
}
