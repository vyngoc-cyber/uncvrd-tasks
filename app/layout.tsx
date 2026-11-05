import type { Metadata, Viewport } from "next";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNCVRD® Tasks",
  description: "Internal task management for the UNCVRD team",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F0EEE5" },
    { media: "(prefers-color-scheme: dark)", color: "#1A1A1A" },
  ],
};

// Applies the saved theme before paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem("uncvrd-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
