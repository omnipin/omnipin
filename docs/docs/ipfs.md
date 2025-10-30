# IPFS

Omnipin supports a wide range of different IPFS providers. If you would like to integrate your provider, feel free to submit a pull request.

## Spec-compliant Pinning Service

- API Docs: https://ipfs.github.io/pinning-services-api-spec
- API env variables: `OMNIPIN_SPEC_TOKEN`, `OMNIPIN_SPEC_URL`
- Supported methods: Pin

Obtain an opaque access token from the service. Populate your environment as such:

```
OMNIPIN_SPEC_TOKEN=<access_token>
OMNIPIN_SPEC_URL=https://pinning-service.example.com
```

A few services provide a pinning service API:

- [Filebase](https://filebase.com) (requires a paid plan)
- [Fula Network](https://api.cloud.fx.land) (free up until 20GB)

## Filebase

- URL: https://filebase.com
- API Docs: https://docs.filebase.com/api-documentation/ipfs-pinning-service-api
- API env variables: `OMNIPIN_FILEBASE_TOKEN` for pinning (if not the first provider), additionally `OMNIPIN_FILEBASE_BUCKET_NAME` for upload + pin.
- Supported methods: Upload, Pin, Status

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

- URL: https://storacha.network
- API Docs: https://docs.storacha.network/how-to/upload
- API env variables: `STORACHA_TOKEN`, `STORACHA_PROOF`
- Supported methods: Upload

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

Save this private key (which starts with `Mg..`) to an environment variable (`OMNIPIN_STORACHA_TOKEN`) in `.env` file.

With the key generated, it is now possible to create a delegation proof:

```bash [Terminal]
storacha delegation create <did_command_above> --can 'store/add' --can 'upload/add' --can 'space/blob/add' --can 'space/index/add' --base64
```

Save the command output in a `OMNIPIN_STORACHA_PROOF` environment variable.

In the end your `.env` file should look like this:

```sh [.env]
OMNIPIN_STORACHA_TOKEN=Mg123456789ogR1enjgn123bi1KqzYz123456v123iLJkeiLIO4=
OMNIPIN_STORACHA_PROOF=mAYIEAJM...uIXm2rXyL...Zxe4Bh6g2RQZwjDUcw3qrvMNXzu2pg/rdd...IGXkvTsk9jnMGkBKPo...A7rC1u/tWHthsGVm8F6...pYJQABcRIgFFoH6R...8ukdZvYKuk2pthEmuyCVkAmPlC/kT3MM
```

## Pinata

- URL: https://pinata.cloud
- API Docs: https://docs.pinata.cloud/files/uploading-files
- API env variables: `OMNIPIN_PINATA_TOKEN`
- Supported methods: Upload, Pin, Status

Go to the dashboard page, then "API Keys" under "Developer" section. Click "New Key". An API key creation dialog should apppear. Select the checkboxes related to pinning. Click "Generate API Key".

![Pinata dashboard](/pinata.png)

Save the JWT token to the `OMNIPIN_PINATA_TOKEN` environment variable.

## 4EVERLAND

- URL: https://www.4everland.org/
- API Docs: https://docs.4everland.org/
- API env variables: `OMNIPIN_4EVERLAND_TOKEN`
- Supported methods: Pin, Status

Open 4EVERLAND dashboard. Navigate to Storage > 4Ever Pin. Click "Access token". Copy the token and save it to the `OMNIPIN_4EVERLAND_TOKEN` environment variable.

## QuickNode

- URL: https://quicknode.com
- API Docs: https://www.quicknode.com/docs/ipfs/Pinning/create-pinnedObject-by-CID
- API env variables: `OMNIPIN_QUICKNODE_TOKEN`
- Supported methods: Pin

Go to the dashboard and open the ["API Keys" page](https://dashboard.quicknode.com/api-keys). Click "Add API Key". In the "Applications" modal choose only "IPFS_REST".

![Quicknode API key modal](/quicknode.png)

## Lighthouse

- URL: https://lighthouse.storage
- API Docs: https://docs.lighthouse.storage/api-docs/lighthouse-api
- API env variables: `OMNIPIN_LIGHTHOUSE_TOKEN`
- Supported methods: Pin

Go to "API Key", enter "Omnipin" in the input box and click "Generate".

## Blockfrost

- URL: https://blockfrost.io
- API Docs: https://blockfrost.dev
- API env variables: `OMNIPIN_BLOCKFROST_TOKEN`
- Supported methods: Pin, Status

Create a new project. It will automatically create a token. Save the token to the `OMNIPIN_BLOCKFROST_TOKEN` environment variable.

## Aleph

- URL: https://aleph.im
- API Docs: https://docs.aleph.im
- API env variables: `OMNIPIN_ALEPH_TOKEN`, `OMNIPIN_ALEPH_CHAIN`
- Supported methods: Pin

`OMNIPIN_ALEPH_TOKEN` is the private key of the account. Buy [$ALEPH](https://aleph.cloud/aleph-token) token for an account, around the same amount as the size of the website distribution. By default, mainnet will be used, but you can specify the chain with `OMNIPIN_ALEPH_CHAIN`. Supported chain are Ethereum (`ETH`), Avalanche (`AVAX`) and Base (`BASE`).

## SimplePage

- URL: https://simplepage.eth.limo
- API Docs: https://simplepage.eth.limo/architecture
- API env variables: `OMNIPIN_SIMPLEPAGE_TOKEN`
- Supported methods: Upload

`OMNIPIN_SIMPLEPAGE_TOKEN` is an ENS name used for a page. SimplePage requires an onchain [subscription](https://simplepage.eth.limo/user-guide/#subscription-management) ($1/month).
