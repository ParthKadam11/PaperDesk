"use client";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { Moon, Sun } from "lucide-react";
import { useSession } from "next-auth/react";
import { signInWithGoogle } from "@/lib/google-sign-in";
import { usePathname, useRouter } from "next/navigation";

const REPO = "https://github.com/ParthKadam11/PaperDesk";

export function SiteHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const { data: session } = useSession();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const signedIn = Boolean(session?.user);

  const links = [
    { href: onHome ? "#desk" : "/#desk", label: "Desk" },
    { href: onHome ? "#markets" : "/#markets", label: "Markets" },
    { href: "/guide", label: "Guide" },
    { href: "/system", label: "System" },
  ];

  return (
    <header className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 sm:h-16 sm:flex-nowrap sm:py-0 sm:px-8">
      <a
        href={onHome ? "#top" : "/"}
        className="font-display text-xl leading-none tracking-tight"
      >
        PaperDesk
      </a>
      <nav className="order-3 flex w-full items-center gap-5 text-[13px] text-muted-foreground sm:order-none sm:w-auto">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="hover:text-foreground"
          >
            {link.label}
          </a>
        ))}
        <a
          href={REPO}
          target="_blank"
          rel="noreferrer"
          className="hidden hover:text-foreground sm:inline"
        >
          Source
        </a>
      </nav>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          className="inline-flex size-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </button>
        <Button
          onClick={
            signedIn
              ? () => router.push("/dashboard")
              : () => void signInWithGoogle("/dashboard")
          }
          className="h-9 rounded-sm bg-foreground px-3 text-[13px] font-medium text-background hover:bg-foreground/90"
        >
          {signedIn ? "Desk" : "Sign in"}
        </Button>
      </div>
    </header>
  );
}
