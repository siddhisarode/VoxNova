import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoxAI — Real-Time Voice Agent Platform",
  description: "Ultra Low-Latency Voice AI Assistants with Groq, OpenRouter, Deepgram, & ElevenLabs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-[#090A0F] text-slate-100 flex flex-col">{children}</body>
    </html>
  );
}
