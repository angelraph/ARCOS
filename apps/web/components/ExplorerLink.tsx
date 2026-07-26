import { truncateHash } from "@/lib/format";

export function ExplorerLink({ href, value, chars = 6 }: { href: string; value: string; chars?: number }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mono text-accent hover:underline"
      title={`${value}\nArc Testnet's explorer can lag or fail to index a transaction even when it's confirmed on-chain. If this link doesn't load, the transaction is still real.`}
    >
      {truncateHash(value, chars)}
    </a>
  );
}
