# `omnipin status`

Checks the deployment status of a IPFS CID across providers.

```sh
omnipin status <cid>
```

By default obtains providers from environment (via `OMNIPIN_` env variables). Alternatively you can use a `providers` option.

## Options

### `providers`

A list of providers to check the deployment status for.

```sh
omnipin status --providers Storacha bafybeibp54tslsez36quqptgzwyda3vo66za3rraujksmsb3d5q247uht4
```

### `verbose`

More verbose logs.
