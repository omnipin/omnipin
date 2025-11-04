import { encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import type { Hex } from 'ox/Hex'
import { sendTransaction, simulateTransaction } from '../../tx.js'
import {
  FILECOIN_PAY_ADDRESS,
  type FilecoinChain,
  filecoinCalibration,
  filProvider,
  USDFC_ADDRESS,
} from '../constants.js'
import { getErc20WithPermitData } from './getErc20WithPermitData.js'
import { signErc20Permit } from './signErc20Permit.js'

const abi = {
  type: 'function',
  inputs: [
    { name: 'token', internalType: 'contract IERC20', type: 'address' },
    { name: 'to', internalType: 'address', type: 'address' },
    { name: 'amount', internalType: 'uint256', type: 'uint256' },
    { name: 'deadline', internalType: 'uint256', type: 'uint256' },
    { name: 'v', internalType: 'uint8', type: 'uint8' },
    { name: 'r', internalType: 'bytes32', type: 'bytes32' },
    { name: 's', internalType: 'bytes32', type: 'bytes32' },
    { name: 'operator', internalType: 'address', type: 'address' },
    { name: 'rateAllowance', internalType: 'uint256', type: 'uint256' },
    { name: 'lockupAllowance', internalType: 'uint256', type: 'uint256' },
    { name: 'maxLockupPeriod', internalType: 'uint256', type: 'uint256' },
  ],
  name: 'depositWithPermitAndApproveOperator',
  outputs: [],
  stateMutability: 'nonpayable',
} as const

export const depositAndApproveOperator = async ({
  from,
  privateKey,
  address,
  amount,
  deadline,
  chain,
}: {
  from: Address
  privateKey: Hex
  address: Address
  amount: bigint
  deadline?: bigint
  chain: FilecoinChain
}) => {
  deadline = deadline ?? BigInt(Math.floor(Date.now() / 1000) + 3600) // 1 hour

  const [balance, name, nonce, version] = await getErc20WithPermitData({
    address,
    chain,
  })

  if (balance < amount)
    throw new Error(`Not enough USDfc to deposit (need: ${amount - balance}`)

  const { r, s } = await signErc20Permit({
    privateKey,
    address,
    amount,
    deadline,
    name,
    nonce,
    version,
  })

  const data = encodeData(abi, [
    USDFC_ADDRESS,
    address,
    amount,
    deadline,
    27,
    r,
    s,
  ])

  const params = {
    provider: filProvider,
    abi,
    from,
    to: FILECOIN_PAY_ADDRESS,
    data,
  } as const
  if (await simulateTransaction(params)) {
    return await sendTransaction({
      ...params,
      privateKey,
      chainId: filecoinCalibration.id,
    })
  }
}
