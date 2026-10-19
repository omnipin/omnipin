import path from 'node:path'
import { isTTY } from '../constants.js'
import { styleText } from '../deps.js'
import { MissingDirectoryError } from '../errors.js'
import { exists, fileSize, walk } from '../utils/fs.js'
import { packCAR } from '../utils/ipfs.js'
import { logger } from '../utils/logger.js'
import { packTAR, tarOutputPath } from '../utils/tar.js'

export type PackActionArgs = Partial<{
  name: string
  dist: string
  verbose: boolean
  'only-hash': boolean
  tar: boolean
}>

export const packAction = async ({
  dir,
  options = {},
}: {
  dir?: string
  options?: PackActionArgs
}) => {
  const {
    name: customName,
    dist,
    verbose,
    'only-hash': onlyHash,
    tar,
  } = options
  if (!dir) {
    if (await exists('dist')) dir = 'dist'
    else if (await exists('.vitepress/dist')) dir = '.vitepress/dist'
    else dir = '.'
  }
  // `path.resolve` correctly handles both absolute and relative inputs,
  // unlike `path.join(cwd, dir)` which clobbers absolute `dir` into
  // nonsense like `${cwd}${dir}` (e.g. `/tmp` + `/home/u/site` → `/tmp/home/u/site`).
  const normalizedPath = path.resolve(dir)
  const name = customName || path.basename(normalizedPath)
  const [size, files] = await walk(normalizedPath, verbose && !onlyHash)

  if (size === 0) throw new MissingDirectoryError(dir)
  const distName = ['.', 'dist'].includes(dir) ? name : dir

  if (!onlyHash) {
    logger.start(
      `Packing ${isTTY ? styleText('cyan', distName) : distName} (${fileSize(size, 2)})`,
    )
  }

  if (tar) {
    // The archive is written to the output directory, which can be the very
    // directory being deployed — a leftover archive from a previous run would
    // then be picked up as site content. Exclude it from the pack.
    const output = tarOutputPath(name, dist)
    const packed = files.filter(
      (file) =>
        path.resolve(normalizedPath, file.path) !== path.resolve(output),
    )
    const packedSize = packed.reduce((total, file) => total + file.size, 0)

    const { bytes } = await packTAR(packed, name, dist)

    if (!onlyHash && output) {
      logger.info(`TAR: ${isTTY ? styleText('white', output) : output}`)
    }

    return { name, bytes, files: packed, size: packedSize, path: output }
  }

  const { rootCID, bytes } = await packCAR(files, name, dist)

  const cid = rootCID.toString()
  if (onlyHash) {
    console.log(cid)
  } else {
    logger.info(`Root CID: ${isTTY ? styleText('white', cid) : cid}`)
  }

  return { name, cid, bytes, files, size }
}
