import { networkInterfaces } from "node:os";
import QRCode from "qrcode";
import { appUrl } from "./docs";

/**
 * Address to share with people who want to open the demo on their own device:
 * PUBLIC_URL if configured, else the address this page was reached on, else (on localhost) the machine's LAN address.
 */
export async function shareUrl() {
  if (process.env.PUBLIC_URL) return { url: process.env.PUBLIC_URL.replace(/\/$/, ""), kind: "public" as const };
  const here = await appUrl();
  const u = new URL(here);
  if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(u.hostname)) return { url: here, kind: u.protocol === "https:" ? ("public" as const) : ("network" as const) };
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((n) => n && n.family === "IPv4" && !n.internal && /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(n.address));
  if (lan) return { url: `${u.protocol}//${lan.address}${u.port ? `:${u.port}` : ""}`, kind: "network" as const };
  return { url: here, kind: "local" as const };
}

export async function qrDataUrl(text: string) {
  return QRCode.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: "M", color: { dark: "#2a1c15", light: "#ffffff" } });
}
