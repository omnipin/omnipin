# `omnipin topup`

Bridge and deposit native tokens to a provider account. Supports **AIOZ**
and **Filecoin**.

```sh
# AIOZ: bridge native AIOZ from Ethereum or BSC into an AIOZ Network address.
OMNIPIN_PK=0x... omnipin topup --provider=AIOZ --from-chain=eth <amount> --to=<address>

# Filecoin: swap any supported source token into FIL (gas) + USDfc (storage).
OMNIPIN_PK=0x... omnipin topup --provider=Filecoin \
  --from-chain=arb --from-token=USDC <amount> --to=<filecoin_address>
```

For AIOZ, `<amount>` is in whole AIOZ tokens (e.g. `1.5`, parsed as an
18-decimal value).

For Filecoin, `<amount>` is in `--from-token` units, decoded against the
token's on-chain `decimals()` (e.g. `10` with `--from-token=USDC` means
10 USDC).

## How it works (AIOZ)

The AIOZ bridge is a deposit-address / hot-wallet design — there is no
contract on the deposit side, no approval, no event ABI. The full top-up
runs in three steps:

1. Look up the live pool address for the chosen direction from the AIOZ
   bridge API (`https://api-bridge.aioz.network/swap-directions`).
2. Send a plain ERC-20 / BEP-20 `transfer(pool, amount)` on the source
   chain, signed by `OMNIPIN_PK`.
3. Poll `https://api-bridge.aioz.network/swap/{tx}` until the relayer
   reports `status: sent`. The relayer credits native AIOZ to the
   **signer's address** on AIOZ Network (chain 168).
4. If `--to` differs from the signer's address, send a native AIOZ
   transfer on chain 168 to `--to`.

The signer is responsible for gas on both the source chain and on AIOZ
mainnet for the optional forward step.

## Options

### `provider`

Provider to top up. One of `AIOZ` or `Filecoin`.

### `from-chain`

Source chain for the bridge.

- **AIOZ:** `eth`, `bsc`.
- **Filecoin:** `eth`, `opt`, `bsc`, `polygon`, `base`, `arb`, `avax`.

### `from-token` (Filecoin only)

Source token to spend on the bridge. Accepts either:

- A known symbol on the source chain (e.g. `USDC`, `USDT`, `ETH`, `BNB`,
  `MATIC`, `AVAX`, `WETH`, `USDC.e`), resolved against a per-chain table.
- A raw `0x…` token address (escape hatch for anything not in the table).

### `to`

- **AIOZ:** destination address on AIOZ Network (chain 168). Defaults to
  the signer's own address.
- **Filecoin:** destination address on Filecoin EVM (chain 314). Defaults
  to the signer's own address.

### `rpc-url`

Custom RPC endpoint for the source chain. Defaults to public nodes.

### `aioz-rpc-url`

Custom RPC endpoint for AIOZ Network (chain 168). Default:
`https://eth-dataseed.aioz.network`.

### `fil-ratio` (Filecoin only)

Fraction in `[0, 1]` of `<amount>` to bridge into native FIL (gas). The
rest goes to USDfc (storage payment). Default: `0.1` (10% FIL, 90% USDfc).

### `slippage` (Filecoin only)

Maximum acceptable slippage for the Squid swap legs, in percent. Default:
`1`.

### `verbose`

More verbose logs, including per-poll status updates from the relayer.

## How it works (Filecoin)

Filecoin top-ups go through [Squid Router](https://app.squidrouter.com),
which wraps Axelar's cross-chain bridge with destination-side gas payment
and an on-chain DEX swap on Filecoin (Sushiswap V3 against the
`axlUSDC` / `USDfc` / `WFIL` pools). This means a single source-chain
transaction can deliver native FIL **and** USDfc on Filecoin without the
recipient needing FIL for destination gas. The bridged USDfc is then
automatically deposited into **Filecoin Pay** for storage payments.

For each invocation:

1. Two Squid `/v2/route` quotes are requested in parallel — one for
   `<amount> * fil-ratio` → FIL, one for `<amount> * (1 - fil-ratio)` →
   USDfc.
2. If `--from-token` is an ERC-20, the Squid router is approved once for
   the cumulative amount.
3. The FIL leg is executed and polled on Squid's `/v2/status` until
   `success`.
4. The USDfc leg is executed and polled the same way.
5. After the USDfc balance arrives on Filecoin, it is deposited into
   **Filecoin Pay** via `depositWithPermit` (or
   `depositWithPermitAndApproveOperator` for first-time deposits). This
   credits the storage payment contract so the `Filecoin` IPFS provider
   can use the funds for dataset uploads.

If Squid's API returns a non-2xx, the error includes a deeplink to the
Squid web UI (`https://app.squidrouter.com/?chains=…&tokens=…`) preserving
the requested parameters, so the user has a manual fallback path.

### Squid integrator ID

Omnipin uses the public `squid-swap-widget` integrator ID by default — the
same identity the official Squid front-end at
[v2.app.squidrouter.com](https://app.squidrouter.com) sends with every
request. No registration required.

Power users can override via `OMNIPIN_SQUID_INTEGRATOR_ID` to use their
own integrator ID:

```sh
export OMNIPIN_SQUID_INTEGRATOR_ID=your-integrator-id
```

This is useful when running many top-ups from the same address (Squid
rate-limits quote requests per `fromAddress`).

## Environment

- `OMNIPIN_PK` — private key (hex, `0x`-prefixed) used to sign all
  source-chain transactions.
- `OMNIPIN_SQUID_INTEGRATOR_ID` — optional Squid integrator ID
  (Filecoin only).

## Notes

### AIOZ

- The bridge pool addresses are EOAs and can rotate. Omnipin always
  re-fetches them from `/swap-directions` before sending.
- The relayer typically credits the destination within 30 seconds to a
  few minutes. The poll waits up to ~10 minutes total.
- AIOZ Network may not be added to your wallet by default. Use chain ID
  `168` (hex `0xa8`), RPC `https://eth-dataseed.aioz.network`, explorer
  `https://explorer.aioz.network`.

### Filecoin

- Bridge legs typically settle within 1–3 minutes. The poll waits up to
  ~10 minutes per leg.
- Squid's per-`fromAddress` quote rate limit can produce transient
  errors during heavy use. Omnipin retries with exponential backoff.
- USDfc is the canonical USD-pegged storage payment token used by the
  `Filecoin` IPFS provider (see [docs/docs/filecoin.md](../docs/filecoin)).
- After bridging, USDfc is deposited into Filecoin Pay via
  `depositWithPermit` (EIP-2612 permit, no prior ERC-20 approval needed).
  First-time deposits also set max operator approval for the FWSS
  storage contract in the same transaction.
- Filecoin EVM chain ID is `314` (hex `0x13a`). Default RPC:
  `https://api.node.glif.io/rpc/v1`. Explorer: `https://filfox.info`.
