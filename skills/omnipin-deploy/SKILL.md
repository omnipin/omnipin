---
name: omnipin-deploy
description: Deploy a static site to decentralized storage with Omnipin. Use this skill when the user wants to deploy, pin, or publish a site/dapp to IPFS, Filecoin, Swarm, or to update an ENS contenthash / DNSLink. The skill prompts the user to choose providers, gathers the required env vars, and asks whether to update ENS (via EOA private key, Safe with a delegate, or Zodiac Roles).
---

# Deploy with Omnipin

Omnipin (`omnipin deploy`) packs a directory and uploads it to one or more decentralized storage providers, optionally updating ENS contenthash and/or DNSLink. This skill walks the user through configuring a deployment end-to-end.

## When to use

Use this skill when the user asks to:

- Deploy / pin / publish a site to IPFS, Filecoin, Swarm, or any combination
- Update an ENS name's contenthash to a new IPFS CID
- Update a DNSLink TXT record via Cloudflare
- Set up Omnipin for the first time in a project (env vars + CLI flags)

Prefer running `omnipin` via the project's package manager runner instead of installing it globally. Detect the runtime in use (look for `bun.lock`, `pnpm-lock.yaml`, `package-lock.json`, `deno.json` / `deno.lock`) and use the matching command:

| Runtime | Command |
|---------|---------|
| Bun     | `bunx omnipin <args>` |
| pnpm    | `pnpm dlx omnipin <args>` |
| npm     | `npx omnipin <args>` |
| Deno    | `deno run --allow-read --allow-env --allow-write --allow-net npm:omnipin <args>` |

Only fall back to a global install (`bun i -g omnipin` / `npm i -g omnipin` / `pnpm i -g omnipin`) if the user explicitly asks for it.

In all command examples below, `omnipin` is shorthand — substitute it with the appropriate runner command above.

## Steps

Follow this flow strictly. Do not invent env var names or providers — only use the ones listed in the [Provider reference](#provider-reference) below.

### 1. Ask which providers to deploy to

Ask the user to pick one or more providers. Present the list grouped by network:

- **IPFS**: `Filecoin`, `Spec`, `Filebase`, `Storacha`, `Pinata`, `4EVERLAND`, `QuickNode`, `Lighthouse`, `Blockfrost`, `Aleph`, `SimplePage`
- **Swarm** (mutually exclusive with IPFS providers): `Swarmy`, `Bee`

Important constraints:

- Swarm and IPFS cannot be combined in the same deploy. If the user picks a Swarm provider, do not also pick IPFS providers.
- For a robust deployment, recommend at least 2 IPFS providers (e.g. `Filecoin` + `Pinata`).

### 2. Collect required env vars per provider

For every chosen provider, list the env vars from the [Provider reference](#provider-reference) and ask the user to provide them. Write them to a `.env` file in the project root (never to a committed file). Do not echo secret values back.

Confirm with the user before writing `.env`. If `.env` already exists, append/merge — never overwrite.

### 3. Ask whether to update ENS

Ask: "Do you want to update an ENS contenthash as part of this deploy?"

- If **no** → skip to step 5.
- If **yes** → ask for the ENS name (e.g. `myapp.eth`) and the chain (`mainnet` or `sepolia`, default `mainnet`).

### 4. Ask how to sign the ENS transaction

If ENS was selected, ask: "How do you want to sign the ENS update?"

Default to **Safe with a delegate** unless the user has a clear reason to pick something else.

Options:

1. **Safe with a delegate (recommended)** — a dedicated EOA (the *delegate*, formerly called *proposer* in Safe terminology) signs and proposes a transaction to the Safe Transaction Service; other Safe owners then confirm and execute it in the Safe UI. The delegate key still has to be available as `OMNIPIN_PK`, but unlike the EOA-only setup, it can only *propose* transactions — not execute them — so a compromise does not directly result in an ENS takeover. Requires:
   - `OMNIPIN_PK` set to the **delegate's** private key. The delegate must be added in the Safe settings (Settings → Delegates) for the Safe that owns the ENS name. It is *not* the ENS name manager's key.
   - `--safe <address-or-ens>` flag (EIP-3770 prefix like `eth:` or `sep:` is supported)
2. **EOA (private key)** — fastest, least secure. Use only for testing or low-stakes deploys. Requires `OMNIPIN_PK` set to the ENS name manager's private key. Warn the user that a compromised key means total ENS takeover.
3. **Safe with Zodiac Roles** — advanced. Use only when the user explicitly asks for it, e.g. high-frequency automated deploys where requiring a Safe confirmation on every push is excessive. Submits the tx onchain through a Zodiac Roles Module using a restricted role key, bypassing the Safe Transaction Service. Requires:
   - `OMNIPIN_PK` set to the role member's private key
   - `--safe <address-or-ens>` flag
   - `--roles-mod-address <0x...>` flag (the deployed Roles Module address)
   - First-time setup: run `omnipin zodiac --safe <safe>` to generate `zodiac.json`, then upload it via the Safe Transaction Builder. See [Safe integration guide](https://omnipin.eth.limo/docs/#safe-integration).

Always warn that storing `OMNIPIN_PK` in `.env` carries risk; recommend the Safe delegate flow for any production or CI deployment.

### 5. Ask about DNSLink (optional)

Ask if the user also wants to update a DNSLink TXT record (Cloudflare-only at the moment). If yes, collect:

- `OMNIPIN_CF_KEY` — Cloudflare API token with Web3 gateway edit permission
- `OMNIPIN_CF_ZONE_ID` — Cloudflare Zone ID

Add `--dnslink` to the final command.

### 6. Build the final command

Compose the `omnipin deploy` invocation from the answers. Examples:

```sh
# IPFS only, no ENS
omnipin deploy --providers Filecoin,Pinata

# IPFS + ENS via EOA
omnipin deploy --providers Filecoin,Pinata --ens myapp.eth

# IPFS + ENS via Safe delegate (recommended)
omnipin deploy --providers Filecoin,Pinata --ens myapp.eth --safe eth:0xYourSafe

# IPFS + ENS via Safe delegate + DNSLink
omnipin deploy \
  --providers Filecoin,Pinata,Storacha \
  --ens myapp.eth \
  --safe eth:0xYourSafe \
  --dnslink

# Advanced: IPFS + ENS via Safe + Zodiac Roles (only when explicitly requested)
omnipin deploy \
  --providers Filecoin,Pinata \
  --ens myapp.eth \
  --safe eth:0xYourSafe \
  --roles-mod-address 0xYourRolesMod

# Swarm via Swarmy + ENS
omnipin deploy --providers Swarmy --ens myapp.eth --safe eth:0xYourSafe
```

Useful extra flags to offer:

- `--strict` — fail if any provider fails (recommended in CI)
- `--dry-run` — simulate the ENS tx without sending (only with `--ens`)
- `--filecoin-chain calibration` — use Filecoin testnet
- `--chain sepolia` — use Sepolia for ENS
- `--verbose` — verbose logs
- `[dir]` — positional arg, defaults to `dist`. Pass e.g. `.vitepress/dist`, `build`, `out` if different.

### 7. Run it

Run the command from the project root. Stream output to the user. On success, show the resulting gateway URL and (if applicable) the Safe Transaction Service link or the executed tx hash.

## Provider reference

Use these env var names exactly. Do not invent variants.

### IPFS providers

| Provider     | `--providers` value | Required env vars |
|--------------|---------------------|-------------------|
| Filecoin     | `Filecoin`          | `OMNIPIN_FILECOIN_TOKEN` (private key of a wallet funded with FIL + USDfc — see [Funding a Filecoin wallet](#funding-a-filecoin-wallet)). Optional: `OMNIPIN_FILECOIN_SP_URL`, `OMNIPIN_FILECOIN_SP_ADDRESS` |
| Spec (generic pinning service) | `Spec` | `OMNIPIN_SPEC_TOKEN`, `OMNIPIN_SPEC_URL` |
| Filebase     | `Filebase`          | `OMNIPIN_FILEBASE_TOKEN`. For upload+pin also `OMNIPIN_FILEBASE_BUCKET_NAME` |
| Storacha     | `Storacha`          | `OMNIPIN_STORACHA_TOKEN`, `OMNIPIN_STORACHA_PROOF` |
| Pinata       | `Pinata`            | `OMNIPIN_PINATA_TOKEN` (JWT) |
| 4EVERLAND    | `4EVERLAND`         | `OMNIPIN_4EVERLAND_TOKEN` |
| QuickNode    | `QuickNode`         | `OMNIPIN_QUICKNODE_TOKEN` |
| Lighthouse   | `Lighthouse`        | `OMNIPIN_LIGHTHOUSE_TOKEN` |
| Blockfrost   | `Blockfrost`        | `OMNIPIN_BLOCKFROST_TOKEN` |
| Aleph        | `Aleph`             | `OMNIPIN_ALEPH_TOKEN` (private key). Optional: `OMNIPIN_ALEPH_CHAIN` (`ETH` \| `AVAX` \| `BASE`) |
| SimplePage   | `SimplePage`        | `OMNIPIN_SIMPLEPAGE_TOKEN` (the ENS name used by the page; requires onchain subscription) |

### Swarm providers

| Provider | `--providers` value | Required env vars |
|----------|---------------------|-------------------|
| Swarmy   | `Swarmy`            | `OMNIPIN_SWARMY_TOKEN` |
| Bee node | `Bee`               | `OMNIPIN_BEE_TOKEN` (postage batch ID), `OMNIPIN_BEE_URL` |

### ENS / Safe

| Purpose | Env / flag |
|---------|------------|
| EOA signer | `OMNIPIN_PK` (private key of ENS manager) |
| Safe delegate | `OMNIPIN_PK` (delegate's key, configured in Safe settings) + `--safe <addr|ens>` |
| Safe + Zodiac Roles | `OMNIPIN_PK` (role member) + `--safe <addr|ens>` + `--roles-mod-address <0x...>` |
| Custom RPC | `--rpc-url <url>` |
| Chain | `--chain mainnet|sepolia` (default `mainnet`) |

### DNSLink (Cloudflare)

| Env var | Purpose |
|---------|---------|
| `OMNIPIN_CF_KEY` | Cloudflare API token with Web3 gateway edit permission |
| `OMNIPIN_CF_ZONE_ID` | Cloudflare Zone ID |

## Funding a Filecoin wallet

The `Filecoin` provider needs a wallet (an Ethereum-style private key in `OMNIPIN_FILECOIN_TOKEN`) funded with two tokens:

- **FIL** — Filecoin's native token, used for gas and as collateral
- **USDfc** — a FIL-backed USD stablecoin, used to pay for storage

For most small (<10 GB) deployments, ~0.1 FIL and ~$1 of USDfc is enough.

If the user doesn't have a wallet yet, generate one with `cast wallet new` (from Foundry) or any other Ethereum keypair tool, save the private key as `OMNIPIN_FILECOIN_TOKEN`, and fund the corresponding address.

### Getting FIL

Suggest these in order:

1. **ChainSafe Forest mainnet faucet** — small drip (0.01 FIL), no swap needed. Direct the user to <https://forest-explorer.chainsafe.dev/faucet/mainnet>, where they paste their `f`-prefixed Filecoin address and click "Send". **The agent should not try to call this endpoint directly** — it's behind a Cloudflare bot challenge, requires a live nonce/gas estimate from a Filecoin RPC, and is rate-limited per address. Always have the user perform this step in the browser.
2. **Calibration testnet** — for testing only. Use the [FIL faucet](https://forest-explorer.chainsafe.dev/faucet/calibnet) and pass `--filecoin-chain calibration` in the deploy command.
3. **Bridge** — for larger amounts. Bridge FIL via [Squid Router](https://app.squidrouter.com/?chains=137%2C314&tokens=0x3c499c542cef5e3811e1192ce70d8cc03d5c3359%2C0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee).

### Getting USDfc

The mainnet faucet **does not provide USDfc** — it only sends FIL. Suggest these:

1. **Swap on Filecoin** — once the wallet has FIL on Filecoin mainnet, swap a small portion to USDfc on [SushiSwap](https://www.sushi.com/filecoin/swap?token0=NATIVE&token1=0x80b98d3aa09ffff255c3ba4a241111ff1262f045). Cross-chain USDfc liquidity is low, so always bridge FIL first and swap *on* Filecoin rather than swapping to USDfc on another chain and bridging.
2. **Calibration testnet** — for testing only, use the [USDfc faucet](https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc).

## Safety notes

- Never commit `.env`. Add it to `.gitignore` if missing.
- Never print secret values back to the user after collection.
- Strongly prefer the Safe delegate flow over a raw `OMNIPIN_PK` (EOA name manager) for any production deployment, especially in CI. The delegate key still lives in `.env` / CI secrets, but it can only propose transactions — not execute them. Only suggest Zodiac Roles when the user specifically needs unattended high-frequency deploys.
- For CI, suggest mapping each env var to a CI secret rather than hard-coding it (see Omnipin's CI/CD docs for a GitHub Actions example).
