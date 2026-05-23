# IPFS

Omnipin supports a wide range of different IPFS providers.

<table>
  <thead>
    <tr>
      <th colspan="3">Provider</th>
      <th colspan="3">Supported by Omnipin</th>
    </tr>
    <tr>
      <th>Name</th>
      <th>Docs</th>
      <th>Permissionless</th>
      <th>Upload</th>
      <th>Pin by CID</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href="#filecoin">Filecoin</a></td>
      <td><a href="https://docs.filoz.org">Docs</a></td>
      <td>✅</td>
      <td>✅</td>
      <td>❌</td>
      <td>❌</td>
    </tr>
    <tr>
      <td><a href="#spec-compliant-pinning-service">Spec</a></td>
      <td><a href="https://ipfs.github.io/pinning-services-api-spec">Docs</a></td>
      <td>❌</td>
      <td>❌</td>
      <td>✅</td>
      <td>✅</td>
    </tr>
    <tr>
      <td><a href="#filebase">Filebase</a></td>
      <td><a href="https://docs.filebase.com">Docs</a></td>
      <td>❌</td>
      <td>✅ ($20/mo)</td>
      <td>✅</td>
      <td>✅</td>
    </tr>
    <tr>
      <td><a href="#ipfs-ninja">IPFS.NINJA</a></td>
      <td><a href="https://ipfs.ninja/docs/api/pinning">Docs</a></td>
      <td>❌</td>
      <td>✅</td>
      <td>✅</td>
      <td>✅</td>
    </tr>
    <tr>
      <td><a href="#aioz">AIOZ</a></td>
      <td><a href="https://docs.aiozpin.network">Docs</a></td>
      <td>❌</td>
      <td>❌</td>
      <td>✅ (~$0.00002/MB)</td>
      <td>❌</td>
    </tr>
    <tr>
      <td><a href="#pinata">Pinata</a></td>
      <td><a href="https://docs.pinata.cloud/files/uploading-files">Docs</a></td>
      <td>❌</td>
      <td>✅ ($20/mo)</td>
      <td>✅ ($20/mo)</td>
      <td>✅</td>
    </tr>
    <tr>
      <td><a href="#4everland">4EVERLAND</a></td>
      <td><a href="https://docs.4everland.org/">Docs</a></td>
      <td>❌</td>
      <td>❌</td>
      <td>✅</td>
      <td>✅</td>
    </tr>
    <tr>
      <td><a href="#quicknode">QuickNode</a></td>
      <td><a href="https://www.quicknode.com/docs/ipfs/Pinning/create-pinnedObject-by-CID">Docs</a></td>
      <td>❌</td>
      <td>❌</td>
      <td>✅ ($49/mo)</td>
      <td>❌</td>
    </tr>
    <tr>
      <td><a href="#lighthouse">Lighthouse</a></td>
      <td><a href="https://docs.lighthouse.storage/lighthouse-1/how-to/pin-cid">Docs</a></td>
      <td>❌</td>
      <td>❌</td>
      <td>✅</td>
      <td>❌</td>
    </tr>
    <tr>
      <td><a href="#blockfrost">Blockfrost</a></td>
      <td><a href="https://blockfrost.dev">Docs</a></td>
      <td>❌</td>
      <td>❌</td>
      <td>✅</td>
      <td>✅</td>
    </tr>
    <tr>
      <td><a href="#aleph">Aleph</a></td>
      <td><a href="https://docs.aleph.im">Docs</a></td>
      <td>✅</td>
      <td>❌</td>
      <td>✅</td>
      <td>❌</td>
    </tr>
    <tr>
      <td><a href="#simplepage">SimplePage</a></td>
      <td><a href="https://simplepage.eth.limo/architecture">Docs</a></td>
      <td>✅</td>
      <td>✅</td>
      <td>❌</td>
      <td>❌</td>
    </tr>

</tbody>
</table>

> Permissionless in this context means that there is no need to register an
> account in order to upload content.

## Filecoin

- Environment variables: `OMNIPIN_FILECOIN_TOKEN`

Omnipin integrates with Filecoin on both mainnet and testnet (calibration). The
integration handles balance checks, automatic deposits to a payment service,
file upload and verification and a payment transaction submission. Only a wallet
account with FIL and USDfc is required.

Create a new wallet keypair and save a private key to the
`OMNIPIN_FILECOIN_TOKEN` environment variable.

```
OMNIPIN_FILECOIN_TOKEN=0xdeadbeef
```

Top up the wallet with a bit of FIL and USDfc.

The easiest path is the built-in `bridge` command, which routes a source
token (e.g. USDC on Arbitrum) into both FIL (gas) and USDfc (storage payment)
on Filecoin via [Squid Router](https://app.squidrouter.com):

```sh
omnipin bridge --provider=Filecoin \
  --from-chain=arb --from-token=USDC 10
omnipin deposit --provider=Filecoin 9
```

`bridge` lands the funds in your Filecoin wallet; `deposit` then moves the
USDfc into Filecoin Pay so the storage provider can spend it. See
[`omnipin bridge`](../cli/bridge) and [`omnipin deposit`](../cli/deposit) for
details.

Alternatively, buy FIL and USDfc manually via
[Squid Router](https://app.squidrouter.com/?chains=137%2C314&tokens=0x3c499c542cef5e3811e1192ce70d8cc03d5c3359%2C0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)
or
[SushiSwap](https://www.sushi.com/filecoin/swap?token0=NATIVE&token1=0x80b98d3aa09ffff255c3ba4a241111ff1262f045).
For most (<10GB) uploads, $1 of USDfc and 0.1 FIL should be enough. If you
buy USDfc manually, you can still call `omnipin deposit --provider=Filecoin`
to move it into Filecoin Pay.

If using the calibration testnet, you can get USDfc through a faucet as well
[here](https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc).

A Filecoin SP (storage provider) is chosen at random from the list of approved
providers for convenience, if there have been no uploads prior. Otherwise a
previously used SP will be used. Provider choice can be overridden with
`OMNIPIN_FILECOIN_SP_URL` and `OMNIPIN_FILECOIN_SP_ADDRESS` environment
variables. If only `OMNIPIN_FILECOIN_SP_ADDRESS` is specified, the provider URL
is fetched from the registry.

:::info
By default, Filecoin mainnet is used. Switch to the calibration testnet
via `--filecoin-chain=calibration`
:::

A more detailed guide on Filecoin can be found [here](/docs/filecoin).

## Spec-compliant Pinning Service

- API env variables: `OMNIPIN_SPEC_TOKEN`, `OMNIPIN_SPEC_URL`

Obtain an opaque access token from the service. Populate your environment as
such:

```
OMNIPIN_SPEC_TOKEN=<access_token>
OMNIPIN_SPEC_URL=https://pinning-service.example.com
```

A few services provide a pinning service API:

- [Filebase](https://filebase.com) (requires a paid plan)
- [Fula Network](https://api.cloud.fx.land) (free up until 20GB)

## Filebase

- API env variables: `OMNIPIN_FILEBASE_TOKEN` (required), `OMNIPIN_FILEBASE_BUCKET_NAME` (required only when Filebase is the upload provider).

Filebase uses two different APIs depending on how Omnipin talks to it, but both
reuse the same `OMNIPIN_FILEBASE_TOKEN` env var:

- **Upload** (Filebase is the first provider in the deploy) — Omnipin uploads
  via the Filebase S3 API. The token must be a base64-encoded
  `accessKey:accessSecret` pair, and `OMNIPIN_FILEBASE_BUCKET_NAME` must be set.
- **Pin** (Filebase is a fallback provider re-pinning an existing CID) — Omnipin
  talks to the Filebase IPFS RPC API. The token must be an IPFS RPC API key.

Pick the variant that matches how you intend to use Filebase. If you need both,
you'll have to swap the value depending on the run.

### Upload (S3 API)

Encode your access key and access secret to base64. Access key and access secret
can be found in the Filebase console.

![Filebase console](/filebase.png)

The easiest way to produce the base64 token is:

```sh
echo "$accessKey:$accessSecret" | base64
```

Save the result as `OMNIPIN_FILEBASE_TOKEN` and set `OMNIPIN_FILEBASE_BUCKET_NAME`
to the bucket you want to upload into.

### Pin (IPFS RPC API)

Filebase provides an RPC API which can be used for pinning.

Request a new token in the "IPFS RPC API Keys" section in "Access Keys" page of
the Filebase console. Save the token to the `OMNIPIN_FILEBASE_TOKEN` environment
variable.

## IPFS.NINJA

- API env variables: `OMNIPIN_IPFS_NINJA_TOKEN`

[IPFS.NINJA](https://ipfs.ninja) is a paid IPFS pinning service with a free
tier. Omnipin uploads via the CAR import endpoint, which preserves the local
root CID exactly (no re-chunking or re-hashing).

Sign up at [ipfs.ninja/signup](https://ipfs.ninja/signup), then create an API
key from the [API Keys page](https://ipfs.ninja/api-keys). The key starts with
`bws_`. Save it as:

```sh
OMNIPIN_IPFS_NINJA_TOKEN=bws_your_api_key_here
```

Maximum CAR upload size is **100 MB** per request. Larger sites need to be
split across multiple imports or use a different provider.

## AIOZ

- API env variables: `OMNIPIN_AIOZ_TOKEN`

[AIOZ](https://aiozpin.network) is a pay-per-pin IPFS service backed by the
AIOZ Network.

Sign up at [aiozpin.network](https://aiozpin.network) then create a key pair on the API Keys page. AIOZ issues two values — a public key and a secret key — which Omnipin expects concatenated with a colon:

```sh
OMNIPIN_AIOZ_TOKEN=<api_key>:<api_secret>
```

### Top-up

AIOZ requires a balance on AIOZ Network (chain 168) to pin content. Use the
`bridge` command to bridge AIOZ tokens from a source chain:

```sh
omnipin bridge --provider=AIOZ \
  --from-chain=eth \
  --to=0xYOUR_AIOZ_PIN_ACCOUNT \
  0.5
```

Supported source chains: `eth`, `bsc`. The command bridges AIOZ from the
source chain to AIOZ Network, then forwards the funds to your AIOZ-Pin
account. See [`omnipin bridge`](../cli/bridge) for details.

## Pinata

- API env variables: `OMNIPIN_PINATA_TOKEN`

Go to the dashboard page, then "API Keys" under "Developer" section. Click "New
Key". An API key creation dialog should appear. Select the checkboxes related
to pinning. Click "Generate API Key".

![Pinata dashboard](/pinata.png)

Save the JWT token to the `OMNIPIN_PINATA_TOKEN` environment variable.

## 4EVERLAND

- API env variables: `OMNIPIN_4EVERLAND_TOKEN`

Open 4EVERLAND dashboard. Navigate to Storage > 4Ever Pin. Click "Access token".
Copy the token and save it to the `OMNIPIN_4EVERLAND_TOKEN` environment
variable.

## QuickNode

- API env variables: `OMNIPIN_QUICKNODE_TOKEN`

Go to the dashboard and open the
["API Keys" page](https://dashboard.quicknode.com/api-keys). Click "Add API
Key". In the "Applications" modal choose only "IPFS_REST".

![Quicknode API key modal](/quicknode.png)

## Lighthouse

- API env variables: `OMNIPIN_LIGHTHOUSE_TOKEN`

Go to "API Key", enter "Omnipin" in the input box and click "Generate".

## Blockfrost

- API env variables: `OMNIPIN_BLOCKFROST_TOKEN`

Create a new project. It will automatically create a token. Save the token to
the `OMNIPIN_BLOCKFROST_TOKEN` environment variable.

## Aleph

- API env variables: `OMNIPIN_ALEPH_TOKEN`, `OMNIPIN_ALEPH_CHAIN`

`OMNIPIN_ALEPH_TOKEN` is the private key of the account. Buy
[$ALEPH](https://aleph.cloud/aleph-token) token for an account, around the same
amount as the size of the website distribution. By default, mainnet will be
used, but you can specify the chain with `OMNIPIN_ALEPH_CHAIN`. Supported chains
are Ethereum (`ETH`), Avalanche (`AVAX`) and Base (`BASE`).

## SimplePage

- API env variables: `OMNIPIN_SIMPLEPAGE_TOKEN`

`OMNIPIN_SIMPLEPAGE_TOKEN` is an ENS name used for a page. SimplePage requires
an onchain
[subscription](https://simplepage.eth.limo/user-guide/#subscription-management)
($1/month).
