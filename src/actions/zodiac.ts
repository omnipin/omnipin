import { writeFile } from 'node:fs/promises'
import { type Address, fromPublicKey } from 'ox/Address'
import { toHex } from 'ox/Bytes'
import type { Hex } from 'ox/Hex'
import { getPublicKey, randomPrivateKey } from 'ox/Secp256k1'
import { chains } from '../constants.js'
import { styleText } from '../deps.js'
import { MissingCLIArgsError } from '../errors.js'
import { logger } from '../utils/logger.js'
import {
  type EIP3770Address,
  getEip3770Address,
} from '../utils/safe/eip3770.js'
import { ENS_DEPLOYER_ROLE } from '../utils/zodiac-roles/init.js'
import type { DeployActionArgs } from './deploy.js'

type ZodiacActionOptions = Pick<DeployActionArgs, 'safe' | 'chain' | 'ens'>

export const zodiacAction = async ({
  rolesModAddress,
  resolverAddress,
  options = {},
}: {
  rolesModAddress: Address
  resolverAddress: Address
  options?: ZodiacActionOptions
}) => {
  if (!resolverAddress) throw new MissingCLIArgsError(['resolverAddress'])
  if (!rolesModAddress) throw new MissingCLIArgsError(['rolesModAddress'])

  const safe = options.safe

  if (!safe) throw new MissingCLIArgsError(['safe'])

  let pk: Hex = process.env.OMNIPIN_PK as Hex

  if (!pk) {
    logger.warn('`OMNIPIN_PK` environment variable not set.')
    logger.info('Generating a Secp256k1 keypair')
    pk = randomPrivateKey()
    logger.text(`   ${styleText('bgBlue', pk)}`)
    logger.info('Save the private key and do not share it to anyone')
  }
  const roleAddress = fromPublicKey(getPublicKey({ privateKey: pk }))

  const safeAddress = getEip3770Address({
    fullAddress: options.safe as EIP3770Address,
    chainId: chains[options.chain || 'mainnet'].id,
  })

  await writeFile(
    'zodiac.json',
    JSON.stringify(
      {
        version: '1.0',
        chainId: chains[options.chain ?? 'mainnet'].id.toString(),
        meta: {
          name: 'Setup Zodiac Roles',
          txBuilderVersion: '1.18.2',
          createdFromSafeAddress: safeAddress.address,
        },
        transactions: [
          {
            to: rolesModAddress,
            value: '0',
            data: null,
            contractMethod: {
              inputs: [
                { internalType: 'address', name: 'module', type: 'address' },
                {
                  internalType: 'bytes32[]',
                  name: 'roleKeys',
                  type: 'bytes32[]',
                },
                { internalType: 'bool[]', name: 'memberOf', type: 'bool[]' },
              ],
              name: 'assignRoles',
              payable: false,
            },
            contractInputsValues: {
              module: roleAddress,
              roleKeys: `[${toHex(ENS_DEPLOYER_ROLE)}]`,
              memberOf: '[true]',
            },
          },
          {
            to: rolesModAddress,
            value: '0',
            data: null,
            contractMethod: {
              inputs: [
                { internalType: 'bytes32', name: 'roleKey', type: 'bytes32' },
                {
                  internalType: 'address',
                  name: 'targetAddress',
                  type: 'address',
                },
              ],
              name: 'scopeTarget',
              payable: false,
            },
            contractInputsValues: {
              roleKey: toHex(ENS_DEPLOYER_ROLE),
              targetAddress: resolverAddress,
            },
          },
          {
            to: rolesModAddress,
            value: '0',
            data: null,
            contractMethod: {
              inputs: [
                { internalType: 'bytes32', name: 'roleKey', type: 'bytes32' },
                {
                  internalType: 'address',
                  name: 'targetAddress',
                  type: 'address',
                },
                { internalType: 'bytes4', name: 'selector', type: 'bytes4' },
                {
                  internalType: 'enum ExecutionOptions',
                  name: 'options',
                  type: 'uint8',
                },
              ],
              name: 'allowFunction',
              payable: false,
            },
            contractInputsValues: {
              roleKey: toHex(ENS_DEPLOYER_ROLE),
              targetAddress: resolverAddress,
              selector: '0x304e6ade',
              options: '0',
            },
          },
        ],
      },
      null,
      2,
    ),
  )

  logger.info('Created zodiac.json in current directory')

  logger.text(
    `Open in a browser: ${styleText(
      'underline',
      `https://app.safe.global/apps/open?safe=${safeAddress.prefix}:${safeAddress.address}&appUrl=https%3A%2F%2Fapps-portal.safe.global%2Ftx-builder`,
    )}`,
  )

  logger.text(`Upload ${styleText('bold', 'zodiac.json')} in the UI`)
}
