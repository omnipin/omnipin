# `omnipin deposit`

Deposit already-held tokens into a provider's payment contract. Today this
is **Filecoin-only** — it moves USDfc from the signer's Filecoin wallet
into [Filecoin Pay](https://docs.filecoin.io) (the storage payment
contract used by the `Filecoin` IPFS provider).

Use `deposit` when:

- You bought USDfc directly on Filecoin (via SushiSwap, a faucet on
  calibnet, an OTC transfer, etc.) and want to skip the bridge.
- You have leftover USDfc in your wallet from a previous bridge and want
  to top up your storage allowance without bridging again.

To bridge from another chain first, use [`omnipin bridge`](./bridge) and
then call `deposit` to move the bridged USDfc into Filecoin Pay.

```sh
OMNIPIN_PK=0x... omnipin deposit --provider=Filecoin <amount>
```

`<amount>` is in whole USDfc tokens (18 decimals), e.g. `5` deposits
5 USDfc.

## How it works

1. The wallet's USDfc balance on Filecoin (chain 314) is checked. If it
   is below `<amount>` the command aborts with a friendly error — no tx
   is sent.
2. Omnipin checks whether the wallet has already granted max approval to
   the FWSS (filecoin-warm-storage-service) operator contract:
   - If yes, it calls `FilecoinPayV1.depositWithPermit` (single tx, signs
     an EIP-2612 permit so no separate ERC-20 approval is needed).
   - If no, it calls `FilecoinPayV1.depositWithPermitAndApproveOperator`
     instead, which deposits **and** sets max operator approval in the
     same tx. This is the typical path for first-time deposits.
3. The deposit transaction is broadcast on Filecoin EVM and the command
   waits for confirmation.

After this, the deposited USDfc is credited inside Filecoin Pay and the
`Filecoin` IPFS provider can spend it to pay storage providers during
`omnipin deploy`.

## Options

### `provider`

Provider to deposit for. Currently only `Filecoin` is supported. AIOZ
does not have a separate deposit step — `bridge` is the whole flow there.

### `from`

Wallet address holding the USDfc on Filecoin. Defaults to the signer's
own address (derived from `OMNIPIN_PK`). Use this when the funds are held
by an address different from the signer (rare — the signer must still
hold the private key used to sign the EIP-2612 permit, so this is mostly
useful for testing).

### `verbose`

More verbose logs.

## Environment

- `OMNIPIN_PK` — private key (hex, `0x`-prefixed) used to sign the
  EIP-2612 permit and broadcast the deposit transaction.

## Notes

- Filecoin EVM chain ID is `314` (hex `0x13a`). Default RPC:
  `https://api.node.glif.io/rpc/v1`. Explorer: `https://filfox.info`.
- USDfc on Filecoin: `0x80b98d3aa09ffff255c3ba4a241111ff1262f045`.
- The deposit goes into Filecoin Pay, which is the same payment rail used
  by the official Synapse SDK; balances deposited here are visible to
  any tool that reads from Filecoin Pay.
- First-time deposits cost slightly more gas because they also set
  operator approval. Subsequent deposits use the cheaper
  `depositWithPermit` path automatically.
