import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif-display", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "NLUJA, Assam — Academic & Examination Management System",
  description: "Integrated end-to-end academic and examination management for National Law University and Judicial Academy, Assam.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
