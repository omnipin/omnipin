import { DeployError, MissingKeyError } from '../../errors.js'
import type { UploadFunction } from '../../types.js'
import { setup } from '../../utils/storacha/setup.js'
import { uploadCAR } from '../../utils/storacha/upload-car.js'

export {
  uploadServicePrincipal,
  uploadServiceURL,
} from '../../utils/storacha/constants.js'

const providerName = 'Storacha'

const abilities = ['space/blob/add', 'space/index/add', 'upload/add'] as const

export const uploadOnStoracha: UploadFunction<{ proof: string }> = async ({
  token,
  car,
  proof,
}) => {
  if (!proof) throw new MissingKeyError(`STORACHA_PROOF`)

  const { agent, space } = await setup({ pk: token, proof })

  if (!space) throw new Error('No space found')

  try {
    const cid = await uploadCAR(
      {
        issuer: agent.issuer,
        proofs: agent.proofs(
          abilities.map((can) => ({ can, with: space.did() })),
        ),
        with: space.did(),
      },
      car,
    )

    return { cid: cid.toString() }
  } catch (e) {
    throw new DeployError(providerName, (e as Error).message, { cause: e })
  }
}
