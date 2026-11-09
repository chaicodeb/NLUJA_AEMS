import type { Metadata, Viewport } from "next";
import { PwaSetup } from "@/components/pwa";
import { Inter, Noto_Sans_Bengali, Noto_Sans_Devanagari, Source_Serif_4 } from "next/font/google";
import { Toaster } from "sonner";
import { I18nProvider } from "@/components/i18n";
import { HTML_LANG } from "@/lib/i18n/config";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif-display", subsets: ["latin"], weight: ["600", "700"] });
// Assamese is written in the Bengali-Assamese script.
const assamese = Noto_Sans_Bengali({ variable: "--font-assamese", subsets: ["bengali"], weight: ["400", "500", "600", "700"] });
const hindi = Noto_Sans_Devanagari({ variable: "--font-hindi", subsets: ["devanagari"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "NLUJA, Assam — Academic & Examination Management System",
  description: "Integrated end-to-end academic and examination management for National Law University and Judicial Academy, Assam.",
  applicationName: "NLUJA AEMS",
  appleWebApp: { capable: true, title: "NLUJA AEMS", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#843f13" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={HTML_LANG[locale]} className={`${inter.variable} ${serif.variable} ${assamese.variable} ${hindi.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <I18nProvider locale={locale}>
          {children}
          <PwaSetup />
        </I18nProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
