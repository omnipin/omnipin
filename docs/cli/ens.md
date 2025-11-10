# `omnipin ens`

Updates ENS domain Content-Hash with an IFPS CID.

```sh
omnipin ens <cid> <domain.eth>
```

Requires a ENS owner's private key (`OMNIPIN_PK`) to be defined.

::: warning

It is recommended to use multisig wallets for deployments instead of using a private key of an Ethereum wallet to avoid wallet compromise risks.

:::

## Options

### `chain`

- Default: `mainnet`
- Options: `mainnet`, `sepolia`

EVM Chain to use for ENS deployment. Requires `--ens` option to be defined.

### `safe`

Deploy using a [Safe](https://safe.global) multisig wallet. Requires private key of a Safe owner/delegate to sign a transaction. [EIP-3770](https://eips.ethereum.org/EIPS/eip-3770) addresses and ENS names are supported. Mainnet is used by default.

```sh
omnipin ens bafybeibp54tslsez36quqptgzwyda3vo66za3rraujksmsb3d5q247uht4 v1rtl.eth --safe safe.omnipin.eth
```

### `rpc-url`

Use a custom Ethereum RPC for transactions. By default, [Public nodes](https://ethereum-rpc.publicnode.com) are used.

### `resolver-address`

Use a custom ENS Resolver address. Public resolvers for mainnet and sepolia are set by default.

### `roles-mod-address`

Zodiac Roles Module address. Requires `safe` option to be provided.

```sh
omnipin ens --roles-mod-address 0x6aBD167a6a29Fd9aDcf4365Ed46C71c913B7c1B1 --safe 0x1234567890000000000000000000000000000000 omnipin.eth bafybeibp54tslsez36quqptgzwyda3vo66za3rraujksmsb3d5q247uht4
```
