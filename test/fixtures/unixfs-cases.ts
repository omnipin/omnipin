// Deterministic corpus for the vendored UnixFS importer's parity suite.
//
// Root CIDs for these cases were captured from `ipfs-unixfs-importer@17.0.1`
// before it was vendored, and live in `unixfs-goldens.json`. Content must be
// byte-identical across runs and platforms, so no crypto/random here.
import type { FileCandidate } from '../../src/utils/ipfs/unixfs.js'

export interface Case {
  name: string
  files: FileCandidate[]
}

// xorshift32 - deterministic, no crypto, stable across platforms
const prng = (seed: number) => () => {
  seed ^= seed << 13
  seed >>>= 0
  seed ^= seed >> 17
  seed ^= seed << 5
  seed >>>= 0
  return seed
}
export const bytes = (n: number, seed = 1) => {
  const next = prng(seed)
  const b = new Uint8Array(n)
  for (let i = 0; i < n; i++) b[i] = next() & 0xff
  return b
}

const te = new TextEncoder()

export const cases: Case[] = [
  {
    name: 'flat-and-nested',
    files: [
      { path: 'a.txt', content: te.encode('File A') },
      { path: 'b.txt', content: te.encode('File B') },
      { path: 'nested/c.txt', content: te.encode('File C') },
      { path: 'nested/deep/d.txt', content: te.encode('File D') },
    ],
  },
  {
    name: 'empty-file',
    files: [{ path: 'empty.txt', content: new Uint8Array(0) }],
  },
  {
    // exactly one chunk, then one byte over - boundary of reduceSingleLeafToSelf
    name: 'chunk-boundary',
    files: [
      { path: 'exact.bin', content: bytes(262_144, 7) },
      { path: 'over.bin', content: bytes(262_145, 9) },
      { path: 'under.bin', content: bytes(262_143, 11) },
    ],
  },
  {
    // 400KB -> 2 chunks -> raw leaves + dag-pb file root
    name: 'chunked-file',
    files: [
      { path: 'index.html', content: te.encode('<html>hi</html>') },
      { path: 'sub/big.bin', content: bytes(400 * 1024, 13) },
    ],
  },
  {
    // 180 chunks > maxChildrenPerNode (174) -> forces a second balanced layer
    name: 'multi-level-balanced',
    files: [{ path: 'huge.bin', content: bytes(180 * 262_144, 17) }],
  },
  {
    name: 'unicode-and-escapes',
    files: [
      { path: 'ünïcødé.txt', content: te.encode('unicode name') },
      { path: '日本語/ファイル.txt', content: te.encode('japanese') },
      { path: 'emoji-🌸.txt', content: te.encode('flower') },
    ],
  },
  {
    name: 'mtime-and-mode',
    files: [
      { path: 'exec.sh', content: te.encode('#!/bin/sh\n'), mode: 0o755 },
      {
        path: 'stamped.txt',
        content: te.encode('x'),
        mtime: { secs: 1_600_000_000n, nsecs: 123 },
      },
      {
        path: 'both.txt',
        content: te.encode('y'),
        mode: 0o644,
        mtime: { secs: 100n },
      },
    ],
  },
  {
    // long names so sum(name + 36) crosses the 262144 links-bytes threshold
    // with ~2000 entries -> exercises HAMT sharding
    name: 'sharded-directory',
    files: Array.from({ length: 2200 }, (_, i) => ({
      path: `shard/${String(i).padStart(5, '0')}-${'n'.repeat(100)}.txt`,
      content: te.encode(`entry ${i}`),
    })),
  },
  {
    // a directory that stays just under the shard threshold
    name: 'unsharded-large-directory',
    files: Array.from({ length: 500 }, (_, i) => ({
      path: `many/${String(i).padStart(4, '0')}.txt`,
      content: te.encode(`e${i}`),
    })),
  },
]
