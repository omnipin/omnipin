# Swarm

Omnipin supports uploading on the [Swarm](https://ethswarm.org) decentralized network via [Swarmy](https://swarmy.cloud) and a Bee node.

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

- API token env variables: `OMNIPIN_BEE_TOKEN`, `OMNIPIN_BEE_URL`
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

Add the batch ID and the Bee node URL to the environment variables:

```sh
OMNIPIN_BEE_TOKEN=8fc...8552c6b
OMNIPIN_BEE_URL=http://localhost:1633
```

Then run the deployment command:

```sh
omnipin deploy --ens omnipin.eth --safe eth:0x...
```
