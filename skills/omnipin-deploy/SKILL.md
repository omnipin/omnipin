---
name: omnipin-deploy
description: Deploy a static site to decentralized storage with Omnipin. Use this skill when the user wants to deploy, pin, or publish a site/dapp to IPFS, Filecoin, Swarm, or to update an ENS contenthash / DNSLink. The skill prompts the user to choose providers, gathers the required env vars, and asks whether to update ENS (via EOA private key or Safe with proposer / Zodiac Roles).
---

# Deploy with Omnipin

Omnipin (`omnipin deploy`) packs a directory and uploads it to one or more decentralized storage providers, optionally updating ENS contenthash and/or DNSLink. This skill walks the user through configuring a deployment end-to-end.

## When to use

Use this skill when the user asks to:

- Deploy / pin / publish a site to IPFS, Filecoin, Swarm, or any combination
- Update an ENS name's contenthash to a new IPFS CID
- Update a DNSLink TXT record via Cloudflare
- Set up Omnipin for the first time in a project (env vars + CLI flags)

If `omnipin` is not installed, install it first:

```sh
bun i -g omnipin   # or: npm i -g omnipin / pnpm i -g omnipin
```

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

Default to **Safe with Proposer** unless the user has a clear reason to pick something else.

Options:

1. **Safe with Proposer (recommended)** — the deploy *proposes* a transaction to the Safe Transaction Service; other Safe owners then confirm and execute it in the Safe UI. A compromised `OMNIPIN_PK` cannot update ENS on its own. Requires:
   - `OMNIPIN_PK` set to a **proposer's** private key (a Safe owner or a delegate added as a proposer in Safe settings)
   - `--safe <address-or-ens>` flag (EIP-3770 prefix like `eth:` or `sep:` is supported)
2. **EOA (private key)** — fastest, least secure. Use only for testing or low-stakes deploys. Requires `OMNIPIN_PK` set to the ENS name manager's private key. Warn the user that a compromised key means total ENS takeover.
3. **Safe with Zodiac Roles** — advanced. Use only when the user explicitly asks for it, e.g. high-frequency automated deploys where requiring a Safe confirmation on every push is excessive. Submits the tx onchain through a Zodiac Roles Module using a restricted role key, bypassing the Safe Transaction Service. Requires:
   - `OMNIPIN_PK` set to the role member's private key
   - `--safe <address-or-ens>` flag
   - `--roles-mod-address <0x...>` flag (the deployed Roles Module address)
   - First-time setup: run `omnipin zodiac --safe <safe>` to generate `zodiac.json`, then upload it via the Safe Transaction Builder. See [Safe integration guide](https://omnipin.eth.limo/docs/#safe-integration).

Always warn that storing `OMNIPIN_PK` in `.env` carries risk; recommend Safe with Proposer for any production or CI deployment.

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

# IPFS + ENS via Safe proposer (recommended)
omnipin deploy --providers Filecoin,Pinata --ens myapp.eth --safe eth:0xYourSafe

# IPFS + ENS via Safe proposer + DNSLink
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
| Filecoin     | `Filecoin`          | `OMNIPIN_FILECOIN_TOKEN` (private key with FIL + USDfc). Optional: `OMNIPIN_FILECOIN_SP_URL`, `OMNIPIN_FILECOIN_SP_ADDRESS` |
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
| Safe proposer | `OMNIPIN_PK` (proposer's key) + `--safe <addr|ens>` |
| Safe + Zodiac Roles | `OMNIPIN_PK` (role member) + `--safe <addr|ens>` + `--roles-mod-address <0x...>` |
| Custom RPC | `--rpc-url <url>` |
| Chain | `--chain mainnet|sepolia` (default `mainnet`) |

### DNSLink (Cloudflare)

| Env var | Purpose |
|---------|---------|
| `OMNIPIN_CF_KEY` | Cloudflare API token with Web3 gateway edit permission |
| `OMNIPIN_CF_ZONE_ID` | Cloudflare Zone ID |

## Safety notes

- Never commit `.env`. Add it to `.gitignore` if missing.
- Never print secret values back to the user after collection.
- Strongly prefer Safe with Proposer over a raw `OMNIPIN_PK` (EOA) for any production deployment, especially in CI. Only suggest Zodiac Roles when the user specifically needs unattended high-frequency deploys.
- For CI, suggest mapping each env var to a CI secret rather than hard-coding it (see Omnipin's CI/CD docs for a GitHub Actions example).
