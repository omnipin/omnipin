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
omnipin deploy --providers Pinata,Lighthouse
```

### `verbose`

More verbose logs.

```sh
omnipin deploy --verbose --providers=Pinata

# 📦 Packing dist (30.99KB)
# 🟢 Root CID: bafybeihw4r72ynkl2zv4od2ru4537qx2zxjkwlzddadqmochzhe524t7qu
# 🟢 Deploying with providers: Pinata
# POST https://uploads.pinata.cloud/v3/files 200
# POST https://api.pinata.cloud/v3/files/public/... 200
# ✓ [>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>] Finished in 3s
# ✔ Deployed across all providers
# Open in a browser:
# IPFS:      https://bafybeihw4r72ynkl2zv4od2ru4537qx2zxjkwlzddadqmochzhe524t7qu.ipfs.dweb.link
# Providers: https://delegated-ipfs.dev/routing/v1/providers/bafybeihw4r72ynkl2zv4od2ru4537qx2zxjkwlzddadqmochzhe524t7qu
```

### `safe`

Deploy using a [Safe](https://safe.global) multisig wallet. Requires private key of a Safe owner/delegate to sign a transaction. [EIP-3770](https://eips.ethereum.org/EIPS/eip-3770) addresses and ENS names are supported. Mainnet is used by default.

The update will be sent to the Safe Transaction Service. `OMNIPIN_PK` must be a proposer's private key; the proposer needs no ENSv2 role because the Safe executes the call.

If a dedicated CI key was granted `ROLE_SET_CONTENTHASH` (via [`omnipin resolver-setup`](/cli/resolver-setup) `--role-address`), omit `--safe` to send the update directly from that key, skipping the Safe Transaction Service.

```sh
# Propose transaction to Safe
omnipin deploy --ens v1rtl.eth --safe safe.omnipin.eth

# Send directly with the ENSv2 role key
omnipin deploy --ens v1rtl.eth
```

### `dnslink`

Update DNSLink. Takes the DNS record name to update. After finishing the deployment, DNSLink is updated afterwards (or after ENS if it was included in the deployment). Equivalent to running `omnipin dnslink <cid> <name>` afterwards.

Requires `OMNIPIN_CF_KEY` and `OMNIPIN_CF_ZONE_ID` environment variables.

```sh
omnipin deploy --dnslink _dnslink.example.com
```

### `progress-bar`

Default: `false`

Render a progress bar during content upload.

```sh
omnipin deploy --progress-bar
```

### `skip-pinned`

Default: `false`

Before uploading, check each provider's pin status for the computed CID and skip providers that already pin it. Only a definite `pinned` status counts; providers that don't support status checks are always deployed to. A failed status check is treated as "not pinned" — the provider is deployed to normally and the deploy never fails because of it, even with `--strict`. Has no effect on Swarm deploys, since Swarm providers replicate content themselves.

For Filecoin, the piece CID is derived from the packed CAR and counted as pinned only when the piece sits in one of your active data sets on the storage provider — a piece stored under someone else's deal is deployed normally.

```sh
omnipin deploy --skip-pinned
```

### `filecoin-chain`

- Default: `mainnet`
- Options: `mainnet`, `calibration`

Filecoin network to use for Filecoin provider deployments.

```sh
omnipin deploy --filecoin-chain calibration
```

### `filecoin-force-new-dataset`

Default: `false`

Create a new Filecoin dataset instead of reusing an existing one. Only relevant for the `Filecoin` provider.

```sh
omnipin deploy --filecoin-force-new-dataset
```

### `dry-run`

Default: `false`

Simulate the ENS transaction without actually sending it. Useful for testing. Requires `--ens` option to be defined.

```sh
omnipin deploy --ens v1rtl.eth --dry-run
```
