import { initiateDeveloperControlledWalletsClient, type FeeLevel } from "@circle-fin/developer-controlled-wallets";

export const circleDeveloperSdk = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

type AbiParam = string | number | boolean | AbiParam[];

type ContractExecutionOptions = {
  walletId: string;
  contractAddress: string;
  abiFunctionSignature: string;
  abiParameters: AbiParam[];
  feeLevel?: FeeLevel;
};

// Signs and submits a contract call through a Circle Developer-Controlled Wallet.
// Used by all three ARCOS agents to call TreasuryPolicy / Escrow / DecisionLedger
// instead of holding raw private keys.
export const executeContract = async ({
  walletId,
  contractAddress,
  abiFunctionSignature,
  abiParameters,
  feeLevel = "MEDIUM",
}: ContractExecutionOptions) => {
  const response = await circleDeveloperSdk.createContractExecutionTransaction({
    walletId,
    contractAddress,
    abiFunctionSignature,
    abiParameters,
    fee: { type: "level", config: { feeLevel } },
  });

  if (!response.data?.id) {
    throw new Error("No transaction ID was returned");
  }

  return { transactionId: response.data.id, status: response.data.state };
};
