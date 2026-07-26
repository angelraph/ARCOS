import { parseAbiItem, createWalletClient, createPublicClient, http, type Hex, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import type { ContractSigner } from "./types";

/** Signs contract calls with a plain local private key via viem, against Arc Testnet
 *  (or any RPC passed in). Used for dry runs before Circle Developer-Controlled Wallets
 *  are wired up, and mirrors the raw-EOA pattern Circle's own arc-nanopayments sample
 *  uses for Gateway/x402 signing. */
export function createLocalSigner(privateKey: Hex, rpcUrl: string): ContractSigner {
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl);
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport });
  const publicClient = createPublicClient({ chain: arcTestnet, transport });

  return {
    address: account.address,
    async execute({ contractAddress, abiFunctionSignature, abiParameters }) {
      const abiItem = parseAbiItem(`function ${abiFunctionSignature}`);
      if (abiItem.type !== "function") throw new Error(`Not a function signature: ${abiFunctionSignature}`);

      // Widen to plain `Abi`/`unknown[]` — a dynamically-built single-item ABI from a
      // runtime string otherwise sends viem's literal type inference into an infinite
      // instantiation (TS2589), since writeContract's generics expect a statically known ABI.
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: [abiItem] as Abi,
        functionName: abiItem.name,
        args: abiParameters as unknown[],
      } as Parameters<typeof walletClient.writeContract>[0]);
      await publicClient.waitForTransactionReceipt({ hash });
      return { txHash: hash };
    },
  };
}
