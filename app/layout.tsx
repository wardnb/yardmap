import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "YardMap — Property OS",
  description: "Full property mapping and landscaping management for Boise, ID",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="flex min-h-screen bg-background">
          <Nav />
          <main className="flex-1 md:ml-16 lg:ml-56 pb-16 md:pb-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
