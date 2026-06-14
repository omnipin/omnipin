# Swarm

Omnipin supports uploading on the [Swarm](https://ethswarm.org) decentralized network via the [Hoverfly](https://github.com/omnipin/hoverfly) light client, [Swarmy](https://swarmy.cloud), or a Bee node.

## Hoverfly

- API token env variables: `OMNIPIN_HOVERFLY_TOKEN`, `OMNIPIN_HOVERFLY_KEY`
- Supported methods: Upload

[Hoverfly](https://github.com/omnipin/hoverfly) is a Swarm light client that requires no Bee node and no remote server — it runs entirely on your machine and works in CI.

### Setup

Install Hoverfly:

```sh
curl -fsSL https://raw.githubusercontent.com/omnipin/hoverfly/main/install.sh | sh
```

Generate a signer key, fund it with xDAI + BZZ on Gnosis (see the [Hoverfly README](https://github.com/omnipin/hoverfly#setup)), then buy a postage batch and generate an overlay nonce:

```sh
hoverfly batch create --key 0xYOUR_KEY --size 200MB --duration 30d
hoverfly vanity-overlay --key 0xYOUR_KEY --peerlist peers.json --output overlay-nonce
```

### Running the daemon

Start the daemon and leave it running:

```sh
hoverfly daemon \
  --socket /tmp/hoverfly.sock \
  --pool-size 256 \
  --identity 0xYOUR_KEY \
  --nonce-file overlay-nonce \
  --peerlist peers.json
```

The repo ships a curated `peers.seed.json`; copy it to `peers.json` for a fast cold start (`cp peers.seed.json peers.json`). On a cold or stale peerlist, add `--discover-rounds 3`.

### Running the deployment

Set the postage batch ID and signer key in the environment:

```sh
OMNIPIN_HOVERFLY_TOKEN=0xf078...1afc # postage batch ID
OMNIPIN_HOVERFLY_KEY=da25...0a44
# OMNIPIN_HOVERFLY_SOCKET=/tmp/hoverfly.sock   # optional, this is the default
```

Then run the deployment command:

```sh
omnipin deploy
```

Omnipin reads the batch depth on-chain automatically; override it with `OMNIPIN_HOVERFLY_DEPTH` to skip the lookup. Other optional knobs: `OMNIPIN_HOVERFLY_RPC_URL`, `OMNIPIN_HOVERFLY_CONCURRENCY` (session fan-out, defaults to 256), and `OMNIPIN_HOVERFLY_RETRIES`.

## Swarmy

- API token env variables: `OMNIPIN_SWARMY_TOKEN`
- Supported methods: Upload

Omnipin supports uploading on the [Swarm](https://ethswarm.org) decentralized network via [Swarmy](https://swarmy.cloud), a storage provider. A website cannot be uploaded to both Swarm and IPFS at the same time, so when opting in for Swarmy, other providers will be ignored.

### Setup

To use Swarmy, you need to create an account on [Swarmy](https://swarmy.cloud). Afterwards, you should request a storage quota on the "Billing" page.

![](/swarm-billing.png)

After receiving your storage quota, generate an API key from the "API Keys" section.

![](/swarm-key.png)

### Running the deployment

Once you have your API key, put it in the environment variables:

```
OMNIPIN_SWARMY_TOKEN=123...
```

Then run the deployment command:

```sh
omnipin deploy --ens omnipin.eth --safe eth:0x...
```

## Bee node

- API token env variables: `OMNIPIN_BEE_TOKEN`, `OMNIPIN_BEE_URL` (optional, defaults to `http://localhost:1633`)
- Supported methods: Upload

### Running a Bee node

[Install Bee](https://docs.ethswarm.org/docs/bee/installation/install) for your platform, then create a minimum viable configuration at `~/.bee.yaml`:

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

This runs Bee as a light node on Swarm mainnet, using the public Gnosis Chain RPC. For production use, point `blockchain-rpc-endpoint` at your own RPC provider (e.g. Gateway.fm, Ankr, or a self-hosted Nethermind/Erigon node) — the public endpoint is rate-limited and Bee will misbehave under throttling.

Start the node:

```sh
bee start --config ~/.bee.yaml
```

On first start, Bee will print your node's Ethereum address. Wait until the node is running, then check the address via the debug API:

```sh
curl -s http://localhost:1633/addresses | jq .ethereum
```

### Funding the node

Bee needs both **xDAI** (for gas) and **xBZZ** (for postage stamps and SWAP) on Gnosis Chain. The easiest way to get both is via the official faucet/funding tool at [fund.ethswarm.org](https://fund.ethswarm.org):

1. Open [fund.ethswarm.org](https://fund.ethswarm.org).
2. Paste your node's Ethereum address.
3. Pay with any supported asset/network — the service handles cross-chain swaps and delivers xDAI + xBZZ directly to your node's address on Gnosis Chain.

Once the funds arrive, Bee will automatically deposit BZZ into the chequebook contract.

### Buying a postage stamp batch

1. Calculate the amount and depth parameters using the [batch calculator](https://docs.ethswarm.org/docs/develop/access-the-swarm/buy-a-stamp-batch/#time--volume-to-depth--amount-calculator). Select how much storage you need and for how long you would like your website to stay on the network. It is possible to top up a batch later.
2. Buy a postage stamp batch for the [Bee node](https://docs.ethswarm.org/docs/develop/access-the-swarm/buy-a-stamp-batch/#buying-a-stamp-batch). The easiest way is via [swarm-cli](https://github.com/ethersphere/swarm-cli):

::: code-group

```sh [npx]
npx @ethersphere/swarm-cli stamp create --amount <amount> --depth <depth>
```

```sh [pnpm]
pnpm dlx @ethersphere/swarm-cli stamp create --amount <amount> --depth <depth>
```

```sh [bun]
bunx @ethersphere/swarm-cli stamp create --amount <amount> --depth <depth>
```

```sh [deno]
deno run -A npm:@ethersphere/swarm-cli stamp create --amount <amount> --depth <depth>
```

:::

Or directly via the Bee API:

```sh
curl -sX POST http://localhost:1633/stamps/<amount>/<depth>
# {
#   "batchID": "8fc...8552c6b", <-- you need this
#   "txHash": "0x51c77...907b675"
# }
```

Add the batch ID to the environment variables:

```sh
OMNIPIN_BEE_TOKEN=8fc...8552c6b
# OMNIPIN_BEE_URL=http://localhost:1633  # optional, this is the default
```

Set `OMNIPIN_BEE_URL` only if your Bee node is not running on `http://localhost:1633`.

Then run the deployment command:

```sh
omnipin deploy --ens omnipin.eth --safe eth:0x...
```
