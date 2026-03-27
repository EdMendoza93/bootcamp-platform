import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { PushNotificationsProvider } from "@/components/providers/PushNotificationsProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wild Atlantic Bootcamp",
  description: "Premium fitness bootcamp platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Bootcamp",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} min-h-full bg-[#f7fbff] text-slate-950 antialiased`}
      >
        <ToastProvider>
          <AuthProvider>
            <PushNotificationsProvider>
              <div className="min-h-screen">{children}</div>
            </PushNotificationsProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
