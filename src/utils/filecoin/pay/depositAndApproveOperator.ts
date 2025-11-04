import { encodeData } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { fromNumber, type Hex } from 'ox/Hex'
import { InternalError } from 'ox/RpcResponse'
import { maxUint256 } from 'ox/Solidity'
import { logger } from '../../logger.js'
import { sendTransaction, simulateTransaction } from '../../tx.js'
import {
  FILECOIN_PAY_ADDRESS,
  type FilecoinChain,
  FWSS_KEEPER_ADDRESS,
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
  privateKey,
  address,
  amount,
  deadline,
  chain,
}: {
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
    chain.contracts.usdfc.address,
    address,
    amount,
    deadline,
    27,
    fromNumber(r, { size: 32 }),
    fromNumber(s, { size: 32 }),
    chain.contracts.storage.address,
    maxUint256,
    maxUint256,
    30n * 2880n, // lockup period
  ])

  const params = {
    provider: filProvider,
    abi,
    from: address,
    to: chain.contracts.payments.address,
    data,
  } as const

  logger.info(`Simulating the Filecoing Warm Storage deposit`)

  try {
    await simulateTransaction(params)

    logger.info(`Depositing to Filecoin Warm Storage`)
    return await sendTransaction({
      ...params,
      privateKey,
      chainId: filecoinCalibration.id,
    })
  } catch (e) {
    if (e instanceof InternalError && e.message.includes('actor not found')) {
      throw new Error('No FIL on account')
    }
    throw e
  }
}
