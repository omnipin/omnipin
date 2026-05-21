# `omnipin topup`

Bridge and deposit native tokens to a provider account. Currently supports
AIOZ; Filecoin will follow.

```sh
OMNIPIN_PK=0x... omnipin topup --provider=AIOZ --from-chain=eth <amount> --to=<address>
```

`<amount>` is the amount of AIOZ in whole tokens (e.g. `1.5`). It is parsed
as an 18-decimal value.

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

Provider to top up. Currently only `AIOZ` is supported.

```sh
omnipin topup --provider=AIOZ ...
```

### `from-chain`

Source chain for the bridge. One of `eth` or `bsc` — the two chains where
AIOZ exists as an ERC-20 / BEP-20 token. Required when `--provider=AIOZ`.

### `to`

Destination address on AIOZ Network (chain 168). Defaults to the signer's
own address (derived from `OMNIPIN_PK`), in which case the forward step is
skipped and the bridged funds simply land at the signer.

For topping up an AIOZ-Pin account, pass the account's deposit address.

### `rpc-url`

Custom RPC endpoint for the source chain. Defaults to public nodes
(`https://ethereum-rpc.publicnode.com` for `eth`,
`https://bsc-dataseed.binance.org` for `bsc`).

### `aioz-rpc-url`

Custom RPC endpoint for AIOZ Network (chain 168). Default:
`https://eth-dataseed.aioz.network`.

### `verbose`

More verbose logs, including per-poll status updates from the relayer.

## Environment

- `OMNIPIN_PK` — private key (hex, `0x`-prefixed) used to sign both the
  source-chain `transfer` and the AIOZ-mainnet forward.

## Notes

- The bridge pool addresses are EOAs and can rotate. Omnipin always
  re-fetches them from `/swap-directions` before sending.
- The relayer typically credits the destination within 30 seconds to a
  few minutes. The poll waits up to ~10 minutes total.
- AIOZ Network may not be added to your wallet by default. Use chain ID
  `168` (hex `0xa8`), RPC `https://eth-dataseed.aioz.network`, explorer
  `https://explorer.aioz.network`.
