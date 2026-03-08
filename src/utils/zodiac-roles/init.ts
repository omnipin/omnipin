import { fromString } from 'ox/Bytes'
import { keccak256 } from 'ox/Hash'

export const ENS_DEPLOYER_ROLE = keccak256(fromString('ENS_DEPLOYER'))
