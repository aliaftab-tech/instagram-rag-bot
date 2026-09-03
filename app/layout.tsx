import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ig-rag-bot — Instagram RAG Assistant",
  description:
    "RAG-powered Instagram DM and comment auto-reply bot for Ali Aftab's portfolio.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
