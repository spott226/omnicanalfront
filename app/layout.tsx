import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://omnicanalfront.vercel.app"),
  title: "next.io by Mercadia — AI customer ops",
  description: "Centraliza conversaciones, califica prospectos y agenda citas con IA.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "next.io by Mercadia — AI customer ops",
    description: "Atención omnicanal y automatización comercial con inteligencia artificial.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "next.io by Mercadia" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("nextio_session_hint")==="1"){document.documentElement.setAttribute("data-nextio-session","1")}}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
