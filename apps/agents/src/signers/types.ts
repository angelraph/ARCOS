type AbiParam = string | number | boolean | bigint | AbiParam[];

export interface ContractCallParams {
  contractAddress: `0x${string}`;
  /** Human-readable signature, e.g. "recordDecision(bytes32,uint8,bytes32,bytes32)" */
  abiFunctionSignature: string;
  abiParameters: AbiParam[];
}

export interface ContractSigner {
  readonly address: `0x${string}`;
  execute(params: ContractCallParams): Promise<{ txHash: `0x${string}` }>;
}
