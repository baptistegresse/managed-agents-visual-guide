import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { uiStrings } from "@/lib/i18n/ui";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = uiStrings(DEFAULT_LOCALE).meta;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      // La page anglaise corrige cet attribut à son ouverture, comme le sélecteur de langue.
      lang={DEFAULT_LOCALE}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Des extensions de navigateur ajoutent des attributs sur <html> avant l'hydratation.
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
