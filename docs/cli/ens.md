# `omnipin ens`

Updates ENS domain Content-Hash with an IPFS CID.

```sh
omnipin ens <cid> <domain.eth>
```

Requires a private key (`OMNIPIN_PK`) to be defined. That key must be either
the owner of the name, a Safe delegate, or an address with the ENSv2
`ROLE_SET_CONTENTHASH` role on the name's resolver. A Safe delegate does not
need the role — the Safe executes the call. See
[`omnipin resolver-setup`](/cli/resolver-setup) for the role setup.

::: warning

It is recommended to use multisig wallets for deployments instead of using a private key of an Ethereum wallet to avoid wallet compromise risks.

:::

## Options

### `chain`

- Default: `mainnet`
- Options: `mainnet`, `sepolia`

EVM Chain to use for ENS deployment.

### `safe`

Deploy using a [Safe](https://safe.global) multisig wallet. Requires private key of a Safe owner/delegate to sign a transaction. [EIP-3770](https://eips.ethereum.org/EIPS/eip-3770) addresses and ENS names are supported. Mainnet is used by default.

```sh
omnipin ens bafybeibp54tslsez36quqptgzwyda3vo66za3rraujksmsb3d5q247uht4 v1rtl.eth --safe safe.omnipin.eth
```

Omit `--safe` when `OMNIPIN_PK` holds an ENSv2 `ROLE_SET_CONTENTHASH` role. In
that case the transaction is sent directly from the role key, without the Safe
Transaction Service. With `--safe`, the proposer only queues the transaction;
the Safe executes it and the proposer needs no role.

### `rpc-url`

Custom Ethereum RPC. By default, [Public nodes](https://ethereum-rpc.publicnode.com) are used.

### `verbose`

More verbose logs.

### `dry-run`

Default: `false`

Simulate the transaction without actually sending it. Useful for testing.

```sh
omnipin ens bafybeibp54tslsez36quqptgzwyda3vo66za3rraujksmsb3d5q247uht4 v1rtl.eth --dry-run
```
