# `omnipin deposit`

Deposit already-held tokens into a provider's payment contract. Supported for **Filecoin** and **Fula**:

- **Filecoin** — moves USDfc from the signer's Filecoin wallet into [Filecoin Pay](https://docs.filecoin.io), the storage payment contract used by the `Filecoin` IPFS provider.
- **Fula** — transfers `$FULA` to Fula's payment vault. Fula has no chain of its own; `$FULA` is an ERC-20 on Ethereum and Base, so a deposit is a plain token transfer that credits your Fula account.

```sh
# Filecoin: deposit 5 USDfc into Filecoin Pay
OMNIPIN_FILECOIN_TOKEN=0x... omnipin deposit --provider=Filecoin 5

# Fula: deposit 10 $FULA to the vault (chain auto-detected from your balance)
OMNIPIN_FULA_PK=0x... omnipin deposit --provider=Fula 10

# Force a specific chain
OMNIPIN_FULA_PK=0x... omnipin deposit --provider=Fula --chain=base 10
```

`<amount>` is in whole tokens (18 decimals) — `5` deposits 5 USDfc, `10` deposits 10 `$FULA`.

Use `deposit` when you want to skip `omnipin deploy`'s auto-fund flow, when you already hold the payment token, or to top up your storage allowance. To bridge from another chain first (Filecoin), use [`omnipin bridge`](./bridge). To acquire `$FULA`, swap for it on a DEX first, then deposit what you hold.

## Options

### `provider`

Provider to deposit for: `Filecoin` or `Fula`.

### `from`

(Filecoin only.) Wallet address holding the USDfc on Filecoin. Defaults to the signer's address (derived from the signing key).

### `chain`

(Fula only.) Chain holding the `$FULA` to deposit: `eth` or `base`. When omitted, Omnipin auto-detects it by reading your `$FULA` balance on each chain and using the one where you hold it (the chain with the larger balance wins; ties go to `eth`). If you hold no `$FULA` on either chain, it defaults to `eth`. Pass `--chain` to force a specific chain.

### `to`

(Fula only.) Override the destination vault address. Defaults to Fula's payment vault. Useful if Fula rotates the vault.

### `rpc-url`

(Fula only.) Custom RPC for the deposit chain. Defaults to a public node for the selected chain.

### `verbose`

More verbose logs.

## Environment

The signing key (hex, `0x`-prefixed) signs and broadcasts the deposit transaction.

For `--provider=Filecoin`, Omnipin reads `OMNIPIN_FILECOIN_TOKEN` first — the same variable the `Filecoin` provider uses for `omnipin deploy` — so you only manage one key. If it is unset, Omnipin falls back to `OMNIPIN_PK`.

For `--provider=Fula`, the signing key is **separate** from the pinning API key: `OMNIPIN_FULA_TOKEN` holds the pinning-service JWT and is **never** used to sign. Omnipin reads `OMNIPIN_FULA_PK` first, falling back to `OMNIPIN_PK`.

- `OMNIPIN_FILECOIN_TOKEN` — preferred for Filecoin; the Filecoin wallet's private key.
- `OMNIPIN_FULA_PK` — preferred for Fula deposits; the wallet private key holding `$FULA`.
- `OMNIPIN_PK` — generic fallback used when no provider-specific key is set.
