import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import 'hardhat-contract-sizer';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import '@parity/hardhat-polkadot';
import { HardhatUserConfig } from 'hardhat/config';
import 'dotenv/config';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.28',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  resolc: {
    compilerSource: 'binary',
    settings: {
      resolcPath: './bin/resolc',
      memoryConfig: {
        heapSize: 128000,
        stackSize: 128000,
      },
    },
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: 31337,
      blockGasLimit: 16777216,
    },
    // Paseo Asset Hub Next (v2) — PRIVATE_KEY must be set in .env
    paseo: {
      url: process.env.PASEO_RPC_URL || 'https://eth-rpc-paseo-next.polkadot.io',
      chainId: 420420417,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      polkadot: {
        target: 'pvm',
      },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
    currency: 'USD',
  },
  etherscan: {
    apiKey: {
      paseo: 'dummy',
    },
    customChains: [
      {
        network: 'paseo',
        chainId: 420420417,
        urls: {
          apiURL: 'https://blockscout-paseo-next.polkadot.io/api',
          browserURL: 'https://blockscout-paseo-next.polkadot.io',
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  typechain: {
    outDir: './typechain-types',
    target: 'ethers-v6',
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: false,
  },
};

export default config;