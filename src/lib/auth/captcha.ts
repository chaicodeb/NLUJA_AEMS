import { createHmac, randomBytes, randomInt } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/** Sign-in v2 CAPTCHA: a distorted 5-digit code drawn as shapes (no text in the image source), verified statelessly and usable once. */
export const CAPTCHA_SECONDS = 120;
const LENGTH = 5;
const DIGITS = "23456789";

// 5×7 dot patterns; drawing the digits as squares keeps the answer out of the SVG source.
const GLYPHS: Record<string, string[]> = {
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET);
const digest = (nonce: string, answer: string) => createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`${nonce}:${answer}`).digest("hex");
const used = new Map<string, number>();

function image(code: string) {
  const w = 240, h = 80, cell = 5;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    parts.push(`<path d="M${rnd(0, 30)} ${rnd(8, h - 8)} C ${rnd(50, 100)} ${rnd(0, h)}, ${rnd(130, 190)} ${rnd(0, h)}, ${rnd(200, w)} ${rnd(8, h - 8)}" stroke="hsl(${randomInt(0, 360)} 30% 70%)" stroke-width="${rnd(0.8, 1.6).toFixed(1)}" fill="none"/>`);
  }
  [...code].forEach((d, i) => {
    const x = 18 + i * 44 + rnd(-3, 3), y = 18 + rnd(-5, 5), angle = rnd(-12, 12).toFixed(1), colour = `hsl(${randomInt(15, 30)} 75% ${randomInt(20, 28)}%)`;
    const dots = GLYPHS[d].flatMap((row, r) => [...row].map((on, c) => (on === "1" ? `<rect x="${(c * cell + rnd(-0.4, 0.4)).toFixed(1)}" y="${(r * cell + rnd(-0.4, 0.4)).toFixed(1)}" width="${(cell - 0.6).toFixed(1)}" height="${(cell - 0.6).toFixed(1)}" rx="1"/>` : "")));
    parts.push(`<g fill="${colour}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle} 12.5 17.5) scale(${rnd(0.95, 1.15).toFixed(2)})">${dots.join("")}</g>`);
  });
  for (let i = 0; i < 60; i++) parts.push(`<circle cx="${rnd(0, w).toFixed(0)}" cy="${rnd(0, h).toFixed(0)}" r="${rnd(0.6, 1.4).toFixed(1)}" fill="hsl(${randomInt(0, 360)} 25% 65%)"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#fbf6ef"/>${parts.join("")}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** New CAPTCHA: the id carries only a keyed hash of the answer, signed and time-limited. */
export async function issueCaptcha() {
  const answer = Array.from({ length: LENGTH }, () => DIGITS[randomInt(DIGITS.length)]).join("");
  const nonce = randomBytes(12).toString("base64url");
  const id = await new SignJWT({ n: nonce, h: digest(nonce, answer) }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(`${CAPTCHA_SECONDS}s`).sign(secret());
  return { id, image: image(answer), answer, expiresInSeconds: CAPTCHA_SECONDS };
}

export type CaptchaCheck = "OK" | "CAPTCHA_REQUIRED" | "CAPTCHA_EXPIRED" | "CAPTCHA_INCORRECT";

/** Each CAPTCHA can be tried once, right or wrong; the form fetches a new one after every attempt. */
export async function checkCaptcha(id: unknown, answer: unknown): Promise<CaptchaCheck> {
  if (typeof id !== "string" || typeof answer !== "string" || !id || !answer.trim()) return "CAPTCHA_REQUIRED";
  let payload: { n?: string; h?: string; exp?: number };
  try {
    payload = (await jwtVerify(id, secret(), { algorithms: ["HS256"] })).payload as typeof payload;
  } catch {
    return "CAPTCHA_EXPIRED";
  }
  const now = Date.now();
  for (const [k, until] of used) if (until < now) used.delete(k);
  if (!payload.n || used.has(payload.n)) return "CAPTCHA_EXPIRED";
  used.set(payload.n, (payload.exp ?? 0) * 1000);
  return digest(payload.n, answer.trim()) === payload.h ? "OK" : "CAPTCHA_INCORRECT";
}
