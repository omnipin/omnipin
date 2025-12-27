# `omnipin deploy`

Deploys content on IPFS to specified providers and outputs a gateway URL, along with other useful information. If a directory is not specified, uses `dist` by default. `.env` is never uploaded.

```sh
omnipin deploy [dir]
```

## Options

### `strict`

Default: `false`

Throw an error if one of the providers fails to deploy.

```sh
omnipin deploy --strict
```

### `ens`

Default: empty

After finishing the deployment, update content hash of an ENS domain to point to the IPFS CID. Equivalent to running `omnipin ens` afterwards.

```sh
omnipin deploy --ens v1rtl.eth
```

### `rpc-url`

Use a custom Ethereum RPC for transactions. By default, [Public nodes](https://ethereum-rpc.publicnode.com) are used.

### `chain`

* Default: `mainnet`
* Options: `mainnet`, `sepolia`

EVM Chain to use. Requires `--ens` option to be defined.

```sh
omnipin deploy --chain mainnet --ens v1rtl.eth
```

### `name`

Name of the distribution directory, excluding the file extension (it's always `.car` for IPFS and `.tar` for Swarm). By default, the current directory name is used.

```sh
omnipin deploy --name my-dapp
```

### `dist`

Target directory for temporary distribution storage. By default, OS temporary directory is used.

```sh
omnipin deploy --dist $PWD ./dist.car
```

### `providers`

An explicit list of providers to deploy on. Requires environment variables of specified providers to be defined. The list is comma separated **without** spaces.

```sh
omnipin deploy --providers Storacha,Lighthouse
```

### `verbose`

More verbose logs.

```sh
omnipin deploy --verbose --providers=Gateway3

# 📦 Packing dist (30.99KB)
# 🟢 Root CID: bafybeihw4r72ynkl2zv4od2ru4537qx2zxjkwlzddadqmochzhe524t7qu
# 🟢 Deploying with providers: Gateway3
# POST https://gw3.io/api/v0/dag/import?size=33547&ts=... 200
# POST https://some-node.gtw3.io/api/v0/dag/import?sargs=...-...-...-...&ssig=.......-...-...%3D%3D 200
# POST https://gw3.io/api/v0/pin/add?arg=...&ts=...&name=dist 200
# ✓ [>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>] Finished in 3s
# ✔ Deployed across all providers
# Open in a browser:
# IPFS:      https://bafybeihw4r72ynkl2zv4od2ru4537qx2zxjkwlzddadqmochzhe524t7qu.ipfs.dweb.link
# Providers: https://delegated-ipfs.dev/routing/v1/providers/bafybeihw4r72ynkl2zv4od2ru4537qx2zxjkwlzddadqmochzhe524t7qu
```

### `safe`

Deploy using a [Safe](https://safe.global) multisig wallet. Requires private key of a Safe owner/delegate to sign a transaction. [EIP-3770](https://eips.ethereum.org/EIPS/eip-3770) addresses and ENS names are supported. Mainnet is used by default.

The update will be sent to the Safe Transaction Service. `OMNIPIN_PK` must be a proposer's privat key.

In case the `roles-mod-address` option is specified, a transaction will submitted via the Zodiac Roles module instead, skipping the Safe Transaction Service and going directly onchain. Just like with EOA, a transaction is simulated locally first.

```sh
# Propose transaction to Safe
omnipin deploy --ens v1rtl.eth --safe safe.omnipin.eth

# Use a restricted role via Zodiac
omnipin deploy --ens v1rtl.eth --roles-mod-address 0x6aBD167a6a29Fd9aDcf4365Ed46C71c913B7c1B1 --safe safe.omnipin.eth
```

### `dnslink`

Update DNSLink. After finishing the deployment, DNSLink is updated afterwards (or after ENS if it was included in the deployment). Equivalent to `omnipin dnslink <cid>`

```sh
omnipin deploy --dnslink
```

### `roles-mod-address`

Zodiac Roles Module address. Requires `safe` option to be provided.

```sh
omnipin deploy --roles-mod-address 0x6aBD167a6a29Fd9aDcf4365Ed46C71c913B7c1B1 --safe 0x1234567890000000000000000000000000000000 omnipin.eth
```
