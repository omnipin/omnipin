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
      <td><a href="https://synapse.filecoin.services">Docs</a></td>
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
      <td>❌</td>
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
      <td><a href="#storacha">Storacha</a></td>
      <td><a href="https://docs.storacha.network/how-to/upload">Docs</a></td>
      <td>❌</td>
      <td>✅</td>
      <td>❌</td>
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
      <td><a href="#aleph">SimplePage</a></td>
      <td><a href="https://simplepage.eth.limo/architecture">Docs</a></td>
      <td>✅</td>
      <td>✅</td>
      <td>❌</td>
      <td>❌</td>
    </tr>

  </tbody>
</table>

> Permissionless in this context means that there is no need to register an account in order to upload content.

## Filecoin

- Environment variables: `OMNIPIN_FILECOIN_SP_URL`, `OMNIPIN_FILECOIN_SP_ADDRESS` and `OMNIPIN_FILECOIN_TOKEN`

Omnipin integrates with Filecoin on both mainnet and testnet (calibration). The integration handles balance checks, automatic deposits to a payment service, file upload and verification and a payment transaction submission. Only a wallet account with FIL and USDfc is required.

Create a new wallet keypair and save a private key to the `OMNIPIN_FILECOIN_TOKEN` environment variable.

```
OMNIPIN_FILECOIN_TOKEN=0xdeadbeef
```

Top up the wallet with a bit of FIL and USDfc.

Buy FIL and USDfc via [Squid Router](https://app.squidrouter.com/?chains=137%2C314&tokens=0x3c499c542cef5e3811e1192ce70d8cc03d5c3359%2C0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee) or [SushiSwap](https://www.sushi.com/filecoin/swap?token0=NATIVE&token1=0x80b98d3aa09ffff255c3ba4a241111ff1262f045). It is recommended to bridge a bit of FIL first, and then swap a portion of it to USDfc, since cross-chain swaps for USDfc have low liquidity in pools. For most (<10GB) uploads, $1 of USDfc and 0.1 FIL should be enough.

If using the calibration testnet, you can get USDFc through a faucet as well [here](https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc).

:::info
By default, Filecoin mainnet is used. Switch to the calibration testnet via `--filecoin-chain=calibration`
:::

A more detailed guide on Filecoin can be found [here](/docs/filecoin).

## Spec-compliant Pinning Service

- API env variables: `OMNIPIN_SPEC_TOKEN`, `OMNIPIN_SPEC_URL`

Obtain an opaque access token from the service. Populate your environment as such:

```
OMNIPIN_SPEC_TOKEN=<access_token>
OMNIPIN_SPEC_URL=https://pinning-service.example.com
```

A few services provide a pinning service API:

- [Filebase](https://filebase.com) (requires a paid plan)
- [Fula Network](https://api.cloud.fx.land) (free up until 20GB)

## Filebase

- API env variables: `OMNIPIN_FILEBASE_TOKEN` for pinning (if not the first provider), additionally `OMNIPIN_FILEBASE_BUCKET_NAME` for upload + pin.

### Upload

`OMNIPIN_FILEBASE_TOKEN` for upload + pin is obtained by encoding access key and access secret to base64. Access key and access secret could be found in the Filebase console.

![Filebase console](/filebase.png)

The easiest way to generate an S3 API token is using the `base64` command:

```sh
echo "$accessKey:$accessSecret" | base64
```

### Pin

Filebase provides an RPC API which can be used for pinning.

Request a new token in the "IPFS RPC API Keys" section in "Access Keys" page of the Filebase console. Save the token to the `OMNIPIN_FILEBASE_TOKEN` environment variable.

## Storacha

- API env variables: `STORACHA_TOKEN`, `STORACHA_PROOF`

Generating a key for Storacha requires a CLI tool.

Install it with:

:::code-group

```sh [pnpm]
pnpm i -g @storacha/cli
```

```sh [npm]
npm i -g @storacha/cli
```

```sh [bun]
bun i -g @storacha/cli
```

:::

Next, login to your Storacha account:

```bash [Terminal]
storacha login
# ? How do you want to login? Via GitHub
# ? Open the GitHub login URL in your default browser? yes
```

Storacha uses spaces (similar to buckets). You would need to create one, if you don't have one already:

```bash [Terminal]
storacha space create
# ? What would you like to call this space? omnipin-docs
# 🔑 You need to save the following secret recovery key somewhere safe! For example write it down on
# a piece of paper and put it inside your favorite book.

# •••• •••••• ••••• ••••• •••••• •••••••• ••••••• ••••••• •••• •••••• •••••• •••• •••••• •••••••
# ••••• •••• ••••••• ••••• •••• ••••• •••••• ••••••• ••••• ••••

# 🔐 Secret recovery key is correct!
# 🏗️ To serve this space we need to set a billing account
# ✨ Billing account is set
# ⛓️ To manage space across devices we need to authorize an account
# ✨ Account is authorized
# 🐔 Space created: did:key:z6Mkw...qAk
```

Save the recovery key in a safe place.

Once you have a space, you need to select it:

```bash [Terminal]
storacha space use <space DID>
```

When both the account and the space are set up, you need to generate a unique private key. It is required to create a delegation proof to be able ot upload files to the space.

```bash [Terminal]
storacha key create
```

Save this private key (which starts with `Mg..`) to an environment variable (`OMNIPIN_STORACHA_TOKEN`).

With the key generated, it is now possible to create a delegation proof:

```bash [Terminal]
storacha delegation create <did_command_above> --can 'store/add' --can 'upload/add' --can 'space/blob/add' --can 'space/index/add' --can 'filecoin/offer' --base64
```

Save the command output in a `OMNIPIN_STORACHA_PROOF` environment variable.

In the end your environment variables should look like this:

```sh [.env]
OMNIPIN_STORACHA_TOKEN=Mg123456789ogR1enjgn123bi1KqzYz123456v123iLJkeiLIO4=
OMNIPIN_STORACHA_PROOF=mAYIEAJM...uIXm2rXyL...Zxe4Bh6g2RQZwjDUcw3qrvMNXzu2pg/rdd...IGXkvTsk9jnMGkBKPo...A7rC1u/tWHthsGVm8F6...pYJQABcRIgFFoH6R...8ukdZvYKuk2pthEmuyCVkAmPlC/kT3MM
```

## Pinata

- API env variables: `OMNIPIN_PINATA_TOKEN`

Go to the dashboard page, then "API Keys" under "Developer" section. Click "New Key". An API key creation dialog should apppear. Select the checkboxes related to pinning. Click "Generate API Key".

![Pinata dashboard](/pinata.png)

Save the JWT token to the `OMNIPIN_PINATA_TOKEN` environment variable.

## 4EVERLAND

- API env variables: `OMNIPIN_4EVERLAND_TOKEN`

Open 4EVERLAND dashboard. Navigate to Storage > 4Ever Pin. Click "Access token". Copy the token and save it to the `OMNIPIN_4EVERLAND_TOKEN` environment variable.

## QuickNode

- API env variables: `OMNIPIN_QUICKNODE_TOKEN`

Go to the dashboard and open the ["API Keys" page](https://dashboard.quicknode.com/api-keys). Click "Add API Key". In the "Applications" modal choose only "IPFS_REST".

![Quicknode API key modal](/quicknode.png)

## Lighthouse

- API env variables: `OMNIPIN_LIGHTHOUSE_TOKEN`

Go to "API Key", enter "Omnipin" in the input box and click "Generate".

## Blockfrost

- API env variables: `OMNIPIN_BLOCKFROST_TOKEN`

Create a new project. It will automatically create a token. Save the token to the `OMNIPIN_BLOCKFROST_TOKEN` environment variable.

## Aleph

- API env variables: `OMNIPIN_ALEPH_TOKEN`, `OMNIPIN_ALEPH_CHAIN`

`OMNIPIN_ALEPH_TOKEN` is the private key of the account. Buy [$ALEPH](https://aleph.cloud/aleph-token) token for an account, around the same amount as the size of the website distribution. By default, mainnet will be used, but you can specify the chain with `OMNIPIN_ALEPH_CHAIN`. Supported chain are Ethereum (`ETH`), Avalanche (`AVAX`) and Base (`BASE`).

## SimplePage

- API env variables: `OMNIPIN_SIMPLEPAGE_TOKEN`

`OMNIPIN_SIMPLEPAGE_TOKEN` is an ENS name used for a page. SimplePage requires an onchain [subscription](https://simplepage.eth.limo/user-guide/#subscription-management) ($1/month).
