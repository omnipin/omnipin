import * as Provider from 'ox/Provider'
import { fromHttp } from 'ox/RpcTransport'

export const filProvider = Provider.from(
  fromHttp('https://api.calibration.node.glif.io/rpc/v1'),
)

export const FILECOIN_REGISTRY_ADDRESS =
  '0x87ede87cef4bfefe0374c3470cb3f5be18b739d5'
