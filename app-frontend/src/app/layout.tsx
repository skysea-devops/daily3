import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://cogletta.com"),
  title: "Cogletta — A simple daily reading habit",
  description:
    "A few hand-picked articles each morning on the topics you choose — an easy daily reading habit, delivered to your inbox.",
  openGraph: {
    siteName: "Cogletta",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
