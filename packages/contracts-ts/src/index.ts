import { defineChain } from "viem";
export { erc20Abi, rugFactoryAbi, rugInstanceAbi, rugPoolAbi, wbnbAbi } from "./abi";

export const bscTestnet = defineChain({
  id: 97,
  name: "BSC Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"] },
  },
  blockExplorers: {
    default: { name: "BscScan", url: "https://testnet.bscscan.com" },
  },
});

export const bscMainnet = defineChain({
  id: 56,
  name: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://bsc-dataseed.bnbchain.org"] },
  },
  blockExplorers: {
    default: { name: "BscScan", url: "https://bscscan.com" },
  },
});

export const WBNB_ADDRESSES = {
  56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  97: "0xae13d989dac2f0debff460ac112a837c89baa7cd",
} as const;

export const DEPLOYMENTS = {
  56: {
    rugFactory: "0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63",
  },
  97: {
    rugFactory: "0x336245d97Abb2F06eb396d6A9d671D4029CE2e5d",
  },
} as const;
