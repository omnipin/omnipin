# `omnipin zodiac`

Generate a JSON payload for the [Safe transaction builder](https://help.safe.global/en/articles/234052-transaction-builder) that configures a [Zodiac Roles module](https://roles.gnosisguild.org) with a restricted ENS updater role. The role's key is `ENS_DEPLOYER`. The role can only execute `setContentHash` on a specified ENS resolver address.

If `OMNIPIN_PK` is not specified, a private key will be generated on the spot.

The first argument is a module's address and a second argument is ENS resolver address.

```sh
omnipin zodiac --safe 0x0Fd2cA6b1a52a1153dA0B31D02fD53854627D262 0x6aBD167a6a29Fd9aDcf4365Ed46C71c913B7c1B1 0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63

# omnipin zodiac --safe 0x0Fd2cA6b1a52a1153dA0B31D02fD53854627D262 0x6aBD167a6a29Fd9aDcf4365Ed46C71c913B7c1B1 --verbose
# ⚠️ `OMNIPIN_PK` environment variable not set.
# 🟢 Generating a Secp256k1 keypair
#    0xeb12099469558be35d53d606e1d5e69d0854c57ef6658e909325c5a0e6493415
# 🟢 Save the private key and do not share it to anyone
# 🟢 Created zodiac.json in current directory
# Open in a browser: https://app.safe.global/apps/open?safe=:0x0Fd2cA6b1a52a1153dA0B31D02fD53854627D262&appUrl=https%3A%2F%2Fapps-portal.safe.global%2Ftx-builder
# Upload zodiac.json in the UI
```

## Options

### `chain`

* Default: `mainnet`
* Options: `mainnet`, `sepolia`

EVM Chain to use.

### `safe`

[Safe](https://safe.global) wallet address with the installed module. [EIP-3770](https://eips.ethereum.org/EIPS/eip-3770) addresses are supported. Mainnet is used by default.

### `rpc-url`

Use a custom Ethereum RPC for transactions. By default, [Public nodes](https://ethereum-rpc.publicnode.com) are used.
