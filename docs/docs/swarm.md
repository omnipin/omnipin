# Swarm

Omnipin supports uploading on the [Swarm](https://ethswarm.org) decentralized network via [Swarmy](https://swarmy.cloud) and a Bee node.

## Swarmy

- API token env variables: `OMNIPIN_SWARMY_TOKEN`
- Supported methods: Upload

Omnipin supports uploading on the [Swarm](https://ethswarm.org) decentralized network via [Swarmy](https://swarmy.cloud), a storage provider. A website is not possible to upload both on Swarm and IPFS, so when opting in for Swarmy, other providers will be ignored.

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

1. Fund your node wallet by [depositing BZZ](https://docs.ethswarm.org/docs/develop/access-the-swarm/buy-a-stamp-batch/#fund-your-nodes-wallet).
2. Calculate the amount and depth parameters for a postage stamp batch using the [batch calculator](https://docs.ethswarm.org/docs/develop/access-the-swarm/buy-a-stamp-batch/#time--volume-to-depth--amount-calculator). Select how much storage you need and for how long you would like your website to stay on the network. It is possible to top up a batch later.
3. Buy a postage stamp batch for the [Bee node](https://docs.ethswarm.org/docs/develop/access-the-swarm/buy-a-stamp-batch/#buying-a-stamp-batch):

```sh
curl -sX POST http://localhost:1633/stamps/<amount>/<depth>
# {
#   "batchID": "8fc...8552c6b", <-- you need this
#   "txHash": "0x51c77...907b675"
# }
```

Add the batch ID to the environment variables:

```sh
OMNIPIN_BEE_TOKEN=8fc...2c6b
```

Then run the the deployment command:

```sh
omnipin deploy --ens omnipin.eth --safe eth:0x...
```
