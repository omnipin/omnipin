# `omnipin status`

Checks the deployment status of an IPFS CID across providers.

```sh
omnipin status <cid>
```

By default obtains providers from environment (via `OMNIPIN_` env variables). Alternatively you can use a `providers` option.

::: info Filecoin
The Filecoin PDP API is keyed by piece CID (CommP), which cannot be derived from the IPFS root CID alone. Set `FILECOIN_PIECE_CID` to check Filecoin pin status; without it the Filecoin provider reports `unknown`. During `deploy --skip-pinned` this is not needed — the piece CID is computed from the packed CAR automatically.
:::

## Options

### `providers`

A list of providers to check the deployment status for.

```sh
omnipin status --providers Pinata bafybeibp54tslsez36quqptgzwyda3vo66za3rraujksmsb3d5q247uht4
```

### `verbose`

More verbose logs.
