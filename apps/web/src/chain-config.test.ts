import { describe, expect, it } from "vitest";
import { WBNB_ADDRESSES, bscMainnet, bscTestnet } from "@rugspull/contracts-ts";
import { ACTIVE_CHAIN_ID, ACTIVE_WBNB_ADDRESS } from "./chain-config";

describe("active web chain configuration", () => {
  it("uses BSC Mainnet WBNB for every production transaction", () => {
    expect(ACTIVE_CHAIN_ID).toBe(bscMainnet.id);
    expect(ACTIVE_WBNB_ADDRESS).toBe(WBNB_ADDRESSES[56]);
    expect(ACTIVE_WBNB_ADDRESS).not.toBe(WBNB_ADDRESSES[bscTestnet.id]);
  });
});
