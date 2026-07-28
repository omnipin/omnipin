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

Ask the user to pick one or more providers. Present the list grouped by network, and note which ones can *upload* content versus only *pin an existing CID*:

- **IPFS — upload-capable** (can host the first copy): `Filecoin`, `Filebase`, `IPFSNinja`, `Pinata`, `Lighthouse`, `Fula`, `SimplePage`
- **IPFS — pin-only** (re-pin a CID uploaded by another provider): `Spec`, `4EVERLAND`, `QuickNode`, `Blockfrost`, `Aleph`, `AIOZ`
- **Swarm** (mutually exclusive with IPFS providers): `Bee` (recommended), `Swarmy`

Important constraints:

- Swarm and IPFS cannot be combined in the same deploy. If Swarm providers are present, Omnipin ignores the IPFS ones entirely, so don't mix them.
- **At least one upload-capable IPFS provider is required.** A deploy consisting only of pin-only providers fails — there is nothing to pin. Omnipin automatically sorts upload-capable providers first, so the order passed to `--providers` doesn't matter.
- For a robust deployment, recommend at least 2 IPFS providers, one of which uploads (e.g. `Filecoin` + `Pinata`, or `Fula` + `4EVERLAND`).
- For Swarm deployments, prefer `Bee` (a self-hosted Bee node) over `Swarmy` (a hosted gateway). Bee gives you direct control over postage stamps and avoids relying on a third-party uploader. Only suggest `Swarmy` if the user explicitly does not want to run a node.

### 2. Collect required env vars per provider

For every chosen provider, list the env vars from the [Provider reference](#provider-reference) and ask the user to provide them. Write them to a `.env` file in the project root (never to a committed file). Do not echo secret values back.

Confirm with the user before writing `.env`. If `.env` already exists, append/merge — never overwrite.

### 3. Ask whether to update ENS

Ask: "Do you want to update an ENS contenthash as part of this deploy?"

- If **no** → skip to step 6.
- If **yes** → ask for the ENS name (e.g. `myapp.eth`) and the chain (`mainnet` or `sepolia`, default `mainnet`).

### 4. Ask how to sign the ENS transaction

If ENS was selected, ask: "How do you want to sign the ENS update?"

Default to **Safe with a delegate** unless the user has a clear reason to pick something else.

Options:

1. **Safe with a delegate (recommended)** — a dedicated EOA (the *delegate*, formerly called *proposer* in Safe terminology) signs and proposes a transaction to the Safe Transaction Service; other Safe owners then confirm and execute it in the Safe UI. The delegate key still has to be available as `OMNIPIN_PK`, but unlike the EOA-only setup, it can only *propose* transactions — not execute them — so a compromise does not directly result in an ENS takeover. Requires:
   - `OMNIPIN_PK` set to the **delegate's** private key. The delegate must be added in the Safe settings (Settings → Delegates) for the Safe that owns the ENS name. It is *not* the ENS name manager's key.
   - `--safe <address-or-ens>` flag (EIP-3770 prefix like `eth:` or `sep:` is supported)

   **Generating a fresh delegate key.** If the user doesn't already have a dedicated delegate key, ask: "Do you want me to generate a new delegate key for you?" If yes, generate it using a vetted tool — never roll your own crypto with Node.js `crypto`, `ethers.Wallet.createRandom()` from a script, or any other ad-hoc snippet. Use one of these, in order:

   1. **`cast wallet new`** (Foundry — preferred). Run it and capture both the address and private key from stdout.
   2. **`openssl`** as a fallback if Foundry isn't installed:
      ```sh
      openssl rand -hex 32   # private key (prepend 0x)
      ```
      Then derive the address with `cast wallet address <pk>` if available, or instruct the user to import the key into a wallet to read off the address.
   3. If neither is installed, ask the user to install Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`) rather than using anything else.

   After generation, write the private key to `.env` as `OMNIPIN_PK`, show the *address* (not the key) to the user, and tell them to add that address as a delegate in the Safe UI.
2. **EOA (private key)** — fastest, least secure. Use only for testing or low-stakes deploys. Requires `OMNIPIN_PK` set to the ENS name manager's private key. Warn the user that a compromised key means total ENS takeover.
3. **Safe with Zodiac Roles** — advanced. Use only when the user explicitly asks for it, e.g. high-frequency automated deploys where requiring a Safe confirmation on every push is excessive. Submits the tx onchain through a Zodiac Roles Module using a restricted role key, bypassing the Safe Transaction Service. Requires:
   - `OMNIPIN_PK` set to the role member's private key
   - `--safe <address-or-ens>` flag
   - `--roles-mod-address <0x...>` flag (the deployed Roles Module address)
   - First-time setup: run `omnipin zodiac --safe <safe> <roles-mod-address> <ens-resolver-address>` to generate `zodiac.json`, then upload it via the Safe Transaction Builder. Both positional addresses are required; the generated role (`ENS_DEPLOYER`) may only call `setContentHash` on that resolver. If `OMNIPIN_PK` is unset, the command generates a keypair and prints the private key once — save it. See [Safe integration guide](https://omnipin.eth.limo/docs/#safe-integration).

Always warn that storing `OMNIPIN_PK` in `.env` carries risk; recommend the Safe delegate flow for any production or CI deployment.

### 5. DNSLink (only if the user explicitly asks)

**Do not bring up DNSLink unless the user mentions it themselves.** It is an opt-in extra and not part of the default flow. If the user does ask to update a DNSLink TXT record (Cloudflare-only at the moment), collect:

- `OMNIPIN_CF_KEY` — Cloudflare API token with Web3 gateway edit permission
- `OMNIPIN_CF_ZONE_ID` — Cloudflare Zone ID

Then add `--dnslink <record>` to the final command, where `<record>` is the DNS record name — e.g. `--dnslink _dnslink.example.com`. The flag takes a value; passing a bare `--dnslink` is wrong.

### 6. Build the final command

Compose the `omnipin deploy` invocation from the answers. Examples:

```sh
# IPFS only, no ENS
omnipin deploy --providers Filecoin,Pinata

# IPFS + ENS via EOA
omnipin deploy --providers Filecoin,Pinata --ens myapp.eth

# IPFS + ENS via Safe delegate (recommended)
omnipin deploy --providers Filecoin,Pinata --ens myapp.eth --safe eth:0xYourSafe

# Advanced: IPFS + ENS via Safe + Zodiac Roles (only when explicitly requested)
omnipin deploy \
  --providers Filecoin,Pinata \
  --ens myapp.eth \
  --safe eth:0xYourSafe \
  --roles-mod-address 0xYourRolesMod

# Swarm via a self-hosted Bee node + ENS (recommended Swarm flow)
omnipin deploy --providers Bee --ens myapp.eth --safe eth:0xYourSafe

# Swarm via Swarmy (hosted) + ENS
omnipin deploy --providers Swarmy --ens myapp.eth --safe eth:0xYourSafe
```

Useful extra flags to offer:

- `--strict` — fail if any provider fails (recommended in CI)
- `--dry-run` — simulate the ENS tx without sending (only with `--ens`)
- `--filecoin-chain calibration` — use Filecoin testnet
- `--filecoin-force-new-dataset` — create a new Filecoin dataset instead of reusing the existing one
- `--chain sepolia` — use Sepolia for ENS
- `--rpc-url <url>` — custom Ethereum RPC (defaults to public nodes)
- `--dnslink <record>` — update a Cloudflare DNSLink record after deploying
- `--name <name>` / `--dist <dir>` — name of the packed archive and where to write it (defaults: current directory name, OS temp dir)
- `--progress-bar` — render an upload progress bar (TTY only)
- `--verbose` — verbose logs
- `[dir]` — positional arg, defaults to `dist`. Pass e.g. `.vitepress/dist`, `build`, `out` if different.

### Other commands worth knowing

Only bring these up when relevant — `deploy` is the main entry point.

| Command | Use |
|---------|-----|
| `omnipin pack [dir]` | Pack into a CAR (or TAR with `--tar` for Swarm) without uploading. `--only-hash` prints just the CIDv1 — handy in CI. |
| `omnipin pin <cid>` | Pin an already-uploaded CID on more providers. |
| `omnipin unpin <cid>` | Unpin a CID from providers that support unpinning. |
| `omnipin status <cid>` | Check pin status across providers. |
| `omnipin ens <cid> <name>` | Update an ENS contenthash separately from a deploy. |
| `omnipin dnslink <cid> <name>` | Update a DNSLink record separately from a deploy. |
| `omnipin bridge <amount>` | Bridge funds into a provider chain (`--provider=AIOZ` or `--provider=Filecoin`). |
| `omnipin deposit <amount>` | Move already-held tokens into a provider's payment contract (`--provider=Filecoin` → Filecoin Pay, `--provider=Fula` → Fula vault). |
| `omnipin zodiac <roles-mod> <resolver>` | Generate `zodiac.json` for the Safe Transaction Builder. |

### 7. Run it

Run the command from the project root. Stream output to the user. On success, show the resulting gateway URL and (if applicable) the Safe Transaction Service link or the executed tx hash.

## Provider reference

Use these env var names exactly. Do not invent variants.

### IPFS providers

| Provider     | `--providers` value | Upload | Required env vars |
|--------------|---------------------|--------|-------------------|
| Filecoin     | `Filecoin`          | ✅ | `OMNIPIN_FILECOIN_TOKEN` — private key of a wallet funded with FIL + USDfc, see [Funding a Filecoin wallet](#funding-a-filecoin-wallet). **Do not ask for SP overrides by default**; Omnipin picks a storage provider automatically. Only mention `OMNIPIN_FILECOIN_SP_URL` / `OMNIPIN_FILECOIN_SP_ADDRESS` if the user explicitly wants to pin to a specific SP. |
| Filebase     | `Filebase`          | ✅ | `OMNIPIN_FILEBASE_TOKEN` + `OMNIPIN_FILEBASE_BUCKET_NAME` when uploading. The token differs per mode: for **upload** it's base64 of `accessKey:accessSecret` (S3 API), for **pin-only** it's an IPFS RPC API key. Paid plan required for uploads. |
| IPFS.NINJA   | `IPFSNinja`         | ✅ | `OMNIPIN_IPFS_NINJA_TOKEN` (key starts with `bws_`; generate at <https://ipfs.ninja/api-keys>). Max 100 MB CAR per upload. |
| Pinata       | `Pinata`            | ✅ | `OMNIPIN_PINATA_TOKEN` (JWT) |
| Lighthouse   | `Lighthouse`        | ✅ | `OMNIPIN_LIGHTHOUSE_TOKEN` |
| Fula         | `Fula`              | ✅ | `OMNIPIN_FULA_TOKEN` (JWT from <https://cloud.fx.land> → API Keys). 500 MB free, then pay-as-you-go in `$FULA`. Top up with `omnipin deposit --provider=Fula <amount>`, which signs with `OMNIPIN_FULA_PK` (a wallet key — **never** the JWT). |
| SimplePage   | `SimplePage`        | ✅ | `OMNIPIN_SIMPLEPAGE_TOKEN` (the ENS name used by the page; requires onchain subscription) |
| Spec (generic pinning service) | `Spec` | ❌ | `OMNIPIN_SPEC_TOKEN`, `OMNIPIN_SPEC_URL` |
| 4EVERLAND    | `4EVERLAND`         | ❌ | `OMNIPIN_4EVERLAND_TOKEN` |
| QuickNode    | `QuickNode`         | ❌ | `OMNIPIN_QUICKNODE_TOKEN` |
| Blockfrost   | `Blockfrost`        | ❌ | `OMNIPIN_BLOCKFROST_TOKEN` |
| Aleph        | `Aleph`             | ❌ | `OMNIPIN_ALEPH_TOKEN` (private key). Optional: `OMNIPIN_ALEPH_CHAIN` (`ETH` \| `AVAX` \| `BASE`) |
| AIOZ         | `AIOZ`              | ❌ | `OMNIPIN_AIOZ_TOKEN` in `api_key:api_secret` form (two values from the AIOZ API Keys page, joined with a colon). Needs an AIOZ balance on AIOZ Network — top up with `omnipin bridge --provider=AIOZ --from-chain=eth --to=<aioz-pin-account> <amount>`. |

### Swarm providers

| Provider | `--providers` value | Required env vars |
|----------|---------------------|-------------------|
| Swarmy   | `Swarmy`            | `OMNIPIN_SWARMY_TOKEN` |
| Bee node (recommended) | `Bee`     | `OMNIPIN_BEE_TOKEN` (postage batch ID); optional `OMNIPIN_BEE_URL` (defaults to `http://localhost:1633`). See [Setting up a Bee node](#setting-up-a-bee-node). |

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

## Setting up a Bee node

When the user picks `Bee` as the Swarm provider, walk them through running a local Bee node and buying a postage batch. Prefer this flow over `Swarmy` for Swarm deployments — it's the upstream-supported path and the user keeps full control of their stamps.

### 1. Install Bee

Follow the official installer for the user's OS: <https://docs.ethswarm.org/docs/bee/installation/install>. On Linux/macOS, the quickest path is the install script:

```sh
curl -s https://api.github.com/repos/ethersphere/bee/releases/latest \
  | grep "browser_download_url.*$(uname -s | tr A-Z a-z)-$(uname -m)" \
  | cut -d '"' -f 4 \
  | xargs -n1 curl -LO
```

Or use the package manager for the platform (Homebrew tap, `.deb`, `.rpm`) per the docs.

### 2. Write the Bee config

Suggest these defaults as a starting point. Write them to `~/.bee.yaml` (or `/etc/bee/bee.yaml` for a system install) and confirm with the user before overwriting an existing config:

```yaml
full-node: false
mainnet: true
password: password
blockchain-rpc-endpoint: "https://rpc.gnosischain.com"
swap-enable: true
verbosity: 4
welcome-message: "welcome-from-the-hive"
warmup-time: 10s
bootnode: /dnsaddr/mainnet.ethswarm.org
```

Notes:

- `full-node: false` runs a light node — sufficient for uploading via Omnipin. Only switch to `true` if the user wants to earn by serving chunks.
- `password: password` is fine for a throwaway local node, but **warn the user to change it** if the node will be exposed beyond `localhost`. The password encrypts the node's Swarm key.
- `blockchain-rpc-endpoint` points at a public Gnosis Chain RPC. For production, suggest a dedicated RPC (e.g. their own node, a paid provider) — public endpoints rate-limit and can stall the node.
- `mainnet: true` + `swap-enable: true` means the node will fund itself on Gnosis Chain. It needs xDAI (gas) and xBZZ (postage + SWAP) on its own address before it can buy stamps — see step 4.

### 3. Start Bee and wait for it to sync

```sh
bee start --config ~/.bee.yaml
```

Or, if installed as a service, `sudo systemctl start bee` / `brew services start swarm-bee`. Wait until `curl http://localhost:1633/health` returns `"status":"ok"` and the node has finished warmup.

### 4. Fund the node

Read the node's Gnosis Chain address:

```sh
curl -s http://localhost:1633/addresses | jq .ethereum
```

Then send xDAI + xBZZ to it via <https://fund.ethswarm.org> — paste the address, pay with any supported asset on any supported network, and the service handles the cross-chain swap and delivers both tokens. This is a browser step; the agent cannot do it. Once the funds land, Bee automatically deposits BZZ into its chequebook contract.

### 5. Buy a postage batch

Omnipin needs a postage batch ID to upload. Pick `amount` (TTL) and `depth` (capacity) with the [batch calculator](https://docs.ethswarm.org/docs/develop/access-the-swarm/buy-a-stamp-batch/#time--volume-to-depth--amount-calculator), then buy the batch:

```sh
# via swarm-cli (bunx / npx / pnpm dlx)
bunx @ethersphere/swarm-cli stamp create --amount <amount> --depth <depth>

# or directly against the Bee API
curl -sX POST "http://localhost:1633/stamps/<amount>/<depth>"
# { "batchID": "8fc...8552c6b", "txHash": "0x51c77...907b675" }
```

`depth=22` (~600 MB usable) is a good "set and forget" default for a static site — lower depths fill up faster than their nominal size suggests because of how chunks spread across the stamp's address space. `amount` scales TTL linearly and can be topped up later; `depth` scales cost roughly exponentially, so only raise it for sites larger than a few hundred MB. The returned `batchID` is the value for `OMNIPIN_BEE_TOKEN`.

### 6. Wire it into `.env`

```sh
OMNIPIN_BEE_TOKEN=<batchID from step 5>
# OMNIPIN_BEE_URL is optional; defaults to http://localhost:1633
```

Then deploy as usual: `omnipin deploy --providers Bee [--ens ...]`.

## Funding a Filecoin wallet

The `Filecoin` provider needs a wallet (an Ethereum-style private key in `OMNIPIN_FILECOIN_TOKEN`) funded with two tokens:

- **FIL** — Filecoin's native token, used for gas and as collateral
- **USDfc** — a FIL-backed USD stablecoin, used to pay for storage

For most small (<10 GB) deployments, ~0.1 FIL and ~$1 of USDfc is enough.

If the user doesn't have a wallet yet, generate one with `cast wallet new` (from Foundry) or any other Ethereum keypair tool, save the private key as `OMNIPIN_FILECOIN_TOKEN`, and fund the corresponding address.

### Funding: `omnipin bridge` + `omnipin deposit`

Omnipin does the whole funding flow itself — **never send the user off to a DEX or bridge UI**. `bridge` routes a source token through [Squid Router](https://app.squidrouter.com) and splits it into FIL (gas) and USDfc (storage payment); `deposit` then moves the USDfc into Filecoin Pay so the storage provider can actually spend it.

```sh
# Bridge 10 USDC from Arbitrum into FIL + USDfc on Filecoin
omnipin bridge --provider=Filecoin --from-chain=arb --from-token=USDC 10

# Move 9 USDfc into Filecoin Pay
omnipin deposit --provider=Filecoin 9
```

Notes:

- Both commands sign with `OMNIPIN_FILECOIN_TOKEN` (falling back to `OMNIPIN_PK`), so no extra key is needed.
- `--from-chain` accepts `eth`, `opt`, `bsc`, `polygon`, `base`, `arb`, `avax`. `--from-token` takes a symbol (`USDC`, `ETH`, `USDT`, …) or a raw `0x` address, and the amount is denominated in that token.
- `--fil-ratio` (default `0.1`) controls what fraction is kept as native FIL for gas; the rest becomes USDfc. `--slippage` (default `1`, percent) caps swap slippage.
- `deposit` works on its own too — if the user already holds USDfc on Filecoin (however they got it), just run `omnipin deposit --provider=Filecoin <amount>` to move it into Filecoin Pay. No swap UI needed.

### Calibration testnet

For testing only, fund from the [FIL faucet](https://forest-explorer.chainsafe.dev/faucet/calibnet) and the [USDfc faucet](https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc), then pass `--filecoin-chain calibration` in the deploy command. **The agent should not call faucet endpoints directly** — they sit behind a bot challenge and are rate-limited per address. This is the one funding step the user has to do in a browser.

## Safety notes

- Never commit `.env`. Add it to `.gitignore` if missing.
- Never print secret values back to the user after collection.
- Strongly prefer the Safe delegate flow over a raw `OMNIPIN_PK` (EOA name manager) for any production deployment, especially in CI. The delegate key still lives in `.env` / CI secrets, but it can only propose transactions — not execute them. Only suggest Zodiac Roles when the user specifically needs unattended high-frequency deploys.
- For CI, suggest mapping each env var to a CI secret rather than hard-coding it (see Omnipin's CI/CD docs for a GitHub Actions example).
