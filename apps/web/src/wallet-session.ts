import { isAddress } from "viem";

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: "accountsChanged" | "chainChanged", listener: (value: unknown) => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged", listener: (value: unknown) => void): void;
};

export type WalletAddress = `0x${string}`;

export function firstAuthorizedAccount(value: unknown): WalletAddress | null {
  if (!Array.isArray(value)) return null;
  const account = value.find((entry): entry is string => typeof entry === "string" && isAddress(entry));
  return account ? account as WalletAddress : null;
}

export async function restoreAuthorizedAccount(provider?: Eip1193Provider): Promise<WalletAddress | null> {
  if (!provider) return null;
  try {
    return firstAuthorizedAccount(await provider.request({ method: "eth_accounts" }));
  } catch {
    return null;
  }
}
