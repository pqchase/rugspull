import { describe, expect, it, vi } from "vitest";
import { firstAuthorizedAccount, restoreAuthorizedAccount, type Eip1193Provider } from "./wallet-session";

const account = "0x1111111111111111111111111111111111111111";

describe("wallet session restoration", () => {
  it("selects the first valid authorized account", () => {
    expect(firstAuthorizedAccount(["not-an-address", account])).toBe(account);
    expect(firstAuthorizedAccount([])).toBeNull();
    expect(firstAuthorizedAccount("nope")).toBeNull();
  });

  it("restores authorization without requesting a new connection", async () => {
    const request = vi.fn().mockResolvedValue([account]);
    const provider = { request } as Eip1193Provider;

    await expect(restoreAuthorizedAccount(provider)).resolves.toBe(account);
    expect(request).toHaveBeenCalledWith({ method: "eth_accounts" });
    expect(request).not.toHaveBeenCalledWith({ method: "eth_requestAccounts" });
  });

  it("treats unavailable providers and provider errors as disconnected", async () => {
    await expect(restoreAuthorizedAccount()).resolves.toBeNull();
    const provider = { request: vi.fn().mockRejectedValue(new Error("locked")) } as Eip1193Provider;
    await expect(restoreAuthorizedAccount(provider)).resolves.toBeNull();
  });
});
