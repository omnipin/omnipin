# Filecoin

Omnipin integrates with Filecoin, a decentralized network of nodes persisting IPFS content, incentivized via onchain payments.

Unlike many other IPFS hosting services that Omnipin integrates with, Filecoin is the only one that is an independent network of service providers. There is no need to attach a credit card, perform KYC, or do any other things a traditional SaaS would require. All payments happen onchain via FIL, Filecoin's native token, and USDfc, a FIL-backed USD stablecoin.

## Custom Filecoin SP

By default, a Filecoin SP (storage provider) is chosen at random for convenience. This can be overridden using environment variables.

The full list of SPs providing upload "warm storage" support can be found on the [official website](https://filecoin.cloud/service-providers).

Obtain the URL and the provider address and save it to the following environment variables:

```sh
OMNIPIN_FILECOIN_SP_URL=https://pdp-dev.kubuxu.com # Service provider URL
OMNIPIN_FILECOIN_SP_ADDRESS=0x8c8c7a9BE47ed491B33B941fBc0276BD2ec25E7e # Service provider address
```

## Pre-deposit

Automatic deposits to Filecoin Pay are known to have been causing issues. It's possible to deposit USDfc into Filecoin Pay before triggering a deployment, using [`omnipin deposit`](../cli/deposit):

```sh
# Pre-deposit 5 USDfc into Filecoin Pay
OMNIPIN_PK=0x... omnipin deposit --provider=Filecoin 5

# Then deploy as usual — the Filecoin provider will use the pre-deposited USDfc
OMNIPIN_PK=0x... omnipin deploy --providers=Filecoin
```

If you don't already hold USDfc on Filecoin, use [`omnipin bridge`](../cli/bridge) first to bridge from another chain.
