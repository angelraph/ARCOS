import Image from "next/image";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/engine", label: "How It Works" },
  { href: "/run", label: "Run It" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 border-b border-border px-4 sm:px-6 py-3 sm:py-4">
      <Link href="/" className="flex items-center gap-3">
        <Image src="/logo.png" alt="ARCOS" width={280} height={70} className="h-10 sm:h-12 w-auto" priority />
      </Link>
      <nav className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-muted hover:text-foreground transition-colors">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
