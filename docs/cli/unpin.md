# `omnipin unpin`

Unpin an IPFS CID from providers. Only providers that support unpinning are used — currently Pinata, Lighthouse, IPFS.NINJA, Blockfrost, 4EVERLAND, Fula and any Spec-compliant pinning service.

```sh
omnipin unpin <cid>
```

By default the provider list is derived from the environment (via `OMNIPIN_` variables). Providers that do not support unpinning are skipped silently.

## Options

### `providers`

An explicit list of providers to unpin from. The list is comma separated **without** spaces.

```sh
omnipin unpin --providers Pinata,Lighthouse bafybeibp54tslsez36quqptgzwyda3vo66za3rraujksmsb3d5q247uht4
```

### `verbose`

More verbose logs.
