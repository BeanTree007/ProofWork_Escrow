// Monad testnet configuration
const CONFIG = {
  chainId: 10143,
  rpcUrl: import.meta.env.VITE_MONAD_RPC || 'https://testnet-rpc.monad.xyz',
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || '0x', // Must be set in .env
};

export function getConfig() {
  return CONFIG;
}

export function getContractAddress() {
  const addr = CONFIG.contractAddress;
  if (!addr || addr === '0x') {
    throw new Error('CONTRACT_ADDRESS not configured. Set VITE_CONTRACT_ADDRESS in .env');
  }
  return addr;
}

export function getRpcUrl() {
  return CONFIG.rpcUrl;
}

export function isChainConfigured() {
  return /^0x[a-fA-F0-9]{40}$/.test(CONFIG.contractAddress || '');
}
