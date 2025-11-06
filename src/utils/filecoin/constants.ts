import type { Address } from 'ox/Address'
import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'

export type FilecoinChainId = 314 | 314159

export type FilecoinChain = {
  id: FilecoinChainId
  name: string
  contracts: {
    multicall3: {
      address: Address
    }
    usdfc: {
      address: Address
    }
    payments: {
      address: Address
    }
    storage: {
      address: Address
    }
    proxy: {
      address: Address
    }
    storageView: {
      address: Address
    }
  }
  blockExplorer: string
}

export const filecoinMainnet = {
  id: 314,
  name: 'Filecoin Mainnet',
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
    usdfc: {
      address: '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045',
    },
    payments: {
      address: '0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa',
    },
    storage: {
      address: '0x8408502033C418E1bbC97cE9ac48E5528F371A9f',
    },
    proxy: {
      address: '0xf55dDbf63F1b55c3F1D4FA7e339a68AB7b64A5eB',
    },
    storageView: {
      address: '0x9e4e6699d8F67dFc883d6b0A7344Bd56F7E80B46',
    },
  },
  blockExplorer: 'https://filecoin.blockscout.com',
} as const satisfies FilecoinChain

export const filecoinCalibration = {
  id: 314159,
  name: 'Filecoin Calibration Testnet',
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
    usdfc: {
      address: '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0',
    },
    payments: {
      address: '0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0',
    },
    storage: {
      address: '0x02925630df557F957f70E112bA06e50965417CA0',
    },
    proxy: {
      address: '0x839e5c9988e4e9977d40708d0094103c0839Ac9D',
    },
    storageView: {
      address: '0xA5D87b04086B1d591026cCE10255351B5AA4689B',
    },
  },
  blockExplorer: 'https://filecoin-testnet.blockscout.com',
} as const satisfies FilecoinChain

export const filecoinChains = {}

export const filProvider = {
  [filecoinMainnet.id]: Provider.from(
    fromHttp('https://api.node.glif.io/rpc/v1'),
  ),
  [filecoinCalibration.id]: Provider.from(
    fromHttp('https://api.calibration.node.glif.io/rpc/v1'),
  ),
}

export const chains = {
  [filecoinMainnet.id]: filecoinMainnet,
  [filecoinCalibration.id]: filecoinCalibration,
}
