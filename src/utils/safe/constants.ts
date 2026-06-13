/* eslint-disable @stylistic/max-len */

export const getTransactionHash = {
  name: 'getTransactionHash',
  type: 'function',
  stateMutability: 'view',
  inputs: [
    {
      type: 'address',
      name: 'to',
    },
    {
      type: 'uint256',
      name: 'value',
    },
    {
      type: 'bytes',
      name: 'data',
    },
    {
      type: 'uint8',
      name: 'operation',
    },
    {
      type: 'uint256',
      name: 'safeTxGas',
    },
    {
      type: 'uint256',
      name: 'baseGas',
    },
    {
      type: 'uint256',
      name: 'gasPrice',
    },
    {
      type: 'address',
      name: 'gasToken',
    },
    {
      type: 'address',
      name: 'refundReceiver',
    },
    {
      type: 'uint256',
      name: '_nonce',
    },
  ],
  outputs: [
    {
      type: 'bytes32',
    },
  ],
} as const

export const getNonce = {
  name: 'nonce',
  type: 'function',
  stateMutability: 'view',
  inputs: [],
  outputs: [
    {
      type: 'uint256',
    },
  ],
} as const
