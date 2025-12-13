# Filecoin

Omnipin integrates with Filecoin, a decentralized network of nodes persisting IPFS content, incentivized via onchain payments.

Unlike many other IPFS hosting services that Omnipin integrates with, Filecoin is the only one that is an independent network of service providers. There is no need to attach a credit card, perform KYC, or do any other things a traditional SaaS would require. All payments happen onchain via FIL, Filecoin's native token, and USDfc, a FIL-backed USD stablecoin.

## Custom Filecoin SP

Filecoin SP choice can be overidden using environment variables.

The full list of SPs providing upload "warm storage" support can be found on the [official website](https://filecoin.cloud/service-providers).

Obtain the URL and the provider address and save it to the following environment variables:

```sh
OMNIPIN_FILECOIN_SP_URL=https://pdp-dev.kubuxu.com # Service provider URL
OMNIPIN_FILECOIN_SP_ADDRESS=0x8c8c7a9BE47ed491B33B941fBc0276BD2ec25E7e # Service provider address
```
