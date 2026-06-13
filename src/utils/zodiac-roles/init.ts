import { getSelector } from 'ox/AbiFunction'
import type { Address } from 'ox/Address'
import { fromString, toHex } from 'ox/Bytes'
import { keccak256 } from 'ox/Hash'

const SET_CONTENT_HASH_SIG = getSelector('setContenthash(bytes32,bytes)')

export const ENS_DEPLOYER_ROLE = keccak256(fromString('ENS_DEPLOYER'))

export const createZodiacRoleParameters = async ({
  roleAddress,
}: {
  roleAddress: Address
}) => {
  return [roleAddress, [toHex(ENS_DEPLOYER_ROLE)], [true]] as const
}

export const allowSetContentHashForRoleParameters = async ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  return [
    toHex(ENS_DEPLOYER_ROLE),
    resolverAddress,
    SET_CONTENT_HASH_SIG,
    0, // CALL
  ]
}

export const setENSResolverAsScopeTargetParameters = async ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  return [toHex(ENS_DEPLOYER_ROLE), resolverAddress]
}
