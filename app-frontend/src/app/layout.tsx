import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://cogletta.com"),
  title: "Cogletta — Read what matters to you",
  description:
    "Every morning, three long-form articles on the topics you care about. Curated by AI, delivered daily.",
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
