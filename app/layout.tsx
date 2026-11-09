import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";

import { SignOutButton } from "./components/feedback/sign-out-button";
import { currentUser } from "./server/auth/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "M4I feedback",
  description:
    "Run the M4I pipelines on your documents and review the results.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-50">
        {user && (
          <nav className="border-b border-zinc-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm sm:px-8">
              <Link href="/" className="font-semibold text-zinc-950">
                M4I
              </Link>
              <Link href="/" className="text-zinc-600 hover:text-zinc-950">
                New run
              </Link>
              <Link href="/runs" className="text-zinc-600 hover:text-zinc-950">
                My runs
              </Link>
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="text-zinc-600 hover:text-zinc-950"
                >
                  Admin
                </Link>
              )}
              <span className="ml-auto text-zinc-500">{user.name}</span>
              <SignOutButton />
            </div>
          </nav>
        )}
        <main className="px-5 py-10 sm:px-8 lg:py-14">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
