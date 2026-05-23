# `omnipin deposit`

Deposit already-held tokens into a provider's payment contract. Currently **Filecoin-only** — moves USDfc from the signer's Filecoin wallet into [Filecoin Pay](https://docs.filecoin.io), the storage payment contract used by the `Filecoin` IPFS provider.

```sh
OMNIPIN_PK=0x... omnipin deposit --provider=Filecoin <amount>
```

`<amount>` is in whole USDfc tokens (18 decimals), e.g. `5` deposits 5 USDfc.

Use `deposit` when you want to skip `omnipin deploy --providers=Filecoin`'s auto-fund flow, when you already hold USDfc on Filecoin, or to top up your storage allowance from leftover USDfc. To bridge from another chain first, use [`omnipin bridge`](./bridge).

## Options

### `provider`

Provider to deposit for. Currently only `Filecoin` is supported.

### `from`

Wallet address holding the USDfc on Filecoin. Defaults to the signer's address (derived from `OMNIPIN_PK`).

### `verbose`

More verbose logs.

## Environment

- `OMNIPIN_PK` — private key (hex, `0x`-prefixed) used to sign the EIP-2612 permit and broadcast the deposit transaction.
