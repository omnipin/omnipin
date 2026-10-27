# `omnipin resolver-setup`

Prepares an [ENSv2 `PermissionedResolver`](https://docs.ens.domains/) so a
restricted key can update a name's content hash without going through the Safe
on every deploy.

```sh
omnipin resolver-setup <domain.eth>
```

The command does one of two things:

1. **The name already uses an ENSv2 permissioned resolver** — grants
   `ROLE_SET_CONTENTHASH` to the role address with `grantRootRoles`.
2. **The name uses another resolver (or none)** — deploys a new
   `PermissionedResolver` through the ENS `VerifiableFactory`, grants
   `ROLE_SET_CONTENTHASH` to the role address during initialization, and points
   the name at the new resolver.

In both cases the transaction is simulated before anything is sent.

## Options

### `chain`

- Default: `mainnet`
- Options: `mainnet`, `sepolia`

EVM Chain to use.

### `safe`

Administer the resolver through a [Safe](https://safe.global) multisig. With
this option the command writes `resolver-setup.json` for the
[Safe Transaction Builder](https://help.safe.global/en/articles/234052-transaction-builder)
instead of sending transactions. The Safe is the resolver admin and the
deployer of the proxy.

The role is granted to the Safe by default, so the proposer/delegate that runs
this command does not need any role. `OMNIPIN_PK` is optional here.

```sh
omnipin resolver-setup omnipin.eth --safe 0x0Fd2cA6b1a52a1153dA0B31D02fD53854627D262
```

To enable unattended updates, also grant the role to a dedicated CI key (the
Safe keeps its own roles):

```sh
omnipin resolver-setup omnipin.eth \
  --safe 0x0Fd2cA6b1a52a1153dA0B31D02fD53854627D262 \
  --role-address 0xYourCiKey
```

### `role-address`

Address to grant `ROLE_SET_CONTENTHASH` to. Defaults to the Safe when `--safe`
is used, and to the `OMNIPIN_PK` address otherwise. Accepts an address, an
[EIP-3770](https://eips.ethereum.org/EIPS/eip-3770) address, or an ENS name. Pass a dedicated CI key for
unattended updates, or a separate Safe that should update the content hash
without owning the name.

## Separate deploy Safe

The account that owns the name and the account that updates the content hash
can be different. For example, the name owner grants the role to a deploy Safe,
and a proposer queues updates on that Safe. The deploy Safe can only set the
content hash, and the proposer has no access to the name or the resolver at all.
This is the [recommended setup](/docs/how-it-works#deploy-safe).

```sh
# Run once, as the name owner (EOA shown; use --safe <owner safe> for a Safe owner)
OMNIPIN_PK=<owner key> omnipin resolver-setup omnipin.eth --role-address <deploy safe>

# Every deploy: the proposer queues setContenthash on the deploy Safe
OMNIPIN_PK=<proposer key> omnipin deploy --ens omnipin.eth --safe <deploy safe>
```

### `resolver`

Use an existing ENSv2 permissioned resolver instead of resolving the name's
current resolver or deploying a new one. The command still points the name at
this resolver if it does not already use it.

### `salt`

CREATE2 salt for a new resolver deployment. By default a fresh random salt is
used (matching the ENS portal), so the resolver address is printed once the
command predicts it.

### `rpc-url`

Custom Ethereum RPC. By default, [Public nodes](https://ethereum-rpc.publicnode.com) are used.

### `dry-run`

Simulate the setup transactions without sending them or writing
`resolver-setup.json`.

### `verbose`

More verbose logs.

## After setup

If you granted the role to a dedicated CI key, run `omnipin ens` with that key
and **without** `--safe`:

```sh
OMNIPIN_PK=<role key> omnipin ens <cid> omnipin.eth
```

Without a separate role key, the Safe holds the role and the update goes through
the usual Safe proposal flow:

```sh
OMNIPIN_PK=<proposer key> omnipin ens <cid> omnipin.eth --safe 0x0Fd2cA6b1a52a1153dA0B31D02fD53854627D262
```

::: warning

`ROLE_SET_CONTENTHASH` is granted on the resolver's root resource. A dedicated
role key can update the content hash of **every** name that uses that resolver,
so give each project its own resolver. The key cannot change other records or
transfer the name. A Safe proposer needs no role at all — the Safe executes the
call.

:::
