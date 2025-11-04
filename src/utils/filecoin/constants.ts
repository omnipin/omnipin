import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'

export const filProvider = Provider.from(
  fromHttp('https://api.calibration.node.glif.io/rpc/v1'),
)

export const FWSS_KEEPER_ADDRESS = '0x02925630df557F957f70E112bA06e50965417CA0'

export const FWSS_PROXY_ADDRESS = '0x839e5c9988e4e9977d40708d0094103c0839Ac9D'

export const FWSS_REGISTRY_VIEW_ADDRESS =
  '0xA5D87b04086B1d591026cCE10255351B5AA4689B'

export const USDFC_ADDRESS = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0'
