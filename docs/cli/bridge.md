# `omnipin bridge`

Bridge native tokens from a source chain into a provider's chain. Supports **AIOZ** (chain 168) and **Filecoin** (chain 314).

```sh
# AIOZ: bridge native AIOZ from Ethereum or BSC into an AIOZ Network address.
OMNIPIN_PK=0x... omnipin bridge --provider=AIOZ --from-chain=eth <amount> --to=<address>

# Filecoin: swap any supported source token into FIL (gas) + USDfc (storage).
OMNIPIN_PK=0x... omnipin bridge --provider=Filecoin \
  --from-chain=arb --from-token=USDC <amount> --to=<filecoin_address>
```

For AIOZ, `<amount>` is in whole AIOZ tokens (e.g. `1.5`). For Filecoin, `<amount>` is in `--from-token` units, decoded against the token's on-chain `decimals()`.

For Filecoin, the bridged USDfc lands in the destination wallet but is not yet spendable by the `Filecoin` IPFS provider — follow up with [`omnipin deposit`](./deposit) to move it into Filecoin Pay.

## Options

### `provider`

Provider to bridge for. One of `AIOZ` or `Filecoin`.

### `from-chain`

Source chain for the bridge.

- **AIOZ:** `eth`, `bsc`.
- **Filecoin:** `eth`, `opt`, `bsc`, `polygon`, `base`, `arb`, `avax`.

### `from-token` (Filecoin only)

Source token to spend on the bridge. Accepts either a known symbol on the source chain (e.g. `USDC`, `USDT`, `ETH`, `BNB`, `MATIC`, `AVAX`, `WETH`, `USDC.e`) or a raw `0x…` token address.

### `to`

Destination address.

### `rpc-url`

Custom RPC endpoint. Defaults to public nodes.

### `aioz-rpc-url`

Custom RPC endpoint for AIOZ Network (chain 168). Default: `https://eth-dataseed.aioz.network`.

### `fil-ratio` (Filecoin only)

Default: `0.1`

Fraction in `[0, 1]` of `<amount>` to bridge into native FIL (gas). The rest goes to USDfc (storage payment).

### `slippage` (Filecoin only)

Default: `1`

Maximum acceptable slippage for the Squid swap legs, in percent.

### `verbose`

More verbose logs.

## Environment

- `OMNIPIN_PK` — private key (hex, `0x`-prefixed) used to sign all source-chain transactions.
- `OMNIPIN_SQUID_INTEGRATOR_ID` — optional [Squid](https://app.squidrouter.com) integrator ID (Filecoin only). Defaults to the public `squid-swap-widget` ID. Override when running many bridges from the same address to avoid Squid's per-`fromAddress` quote rate limit.
