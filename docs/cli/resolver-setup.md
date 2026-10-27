# `omnipin resolver-setup`

Allows another account to update a name's content hash, without being able to
transfer the name or change its other records. Run it once as the name owner;
the [Get Started guide](/docs/#_2-allow-it-to-update-your-name) shows the full
flow with a throwaway account.

```sh
OMNIPIN_PK=<name owner key> omnipin resolver-setup <domain.eth> --role-address <address>
```

The account receives the `ROLE_SET_CONTENTHASH` role on an
[ENSv2 `PermissionedResolver`](/docs/how-it-works#permissioned-resolver). The
command does one of two things:

1. **The name already uses an ENSv2 permissioned resolver**: grants
   `ROLE_SET_CONTENTHASH` to the role address with `grantRootRoles`.
2. **The name uses another resolver (or none)**: deploys a new
   `PermissionedResolver` through the ENS `VerifiableFactory`, grants
   `ROLE_SET_CONTENTHASH` to the role address during initialization, and points
   the name at the new resolver. The name owner becomes the resolver admin with
   every role.

Every transaction is simulated before anything is sent.

::: warning
A new resolver starts empty, so the name's other records stop resolving until
they are [re-created](#re-creating-records). Run with `--dry-run` first to see
whether a new resolver will be deployed.
:::

## Options

### `role-address`

Address to grant `ROLE_SET_CONTENTHASH` to: a throwaway key, or a Safe that
should update the content hash without owning the name. Accepts an address, an
[EIP-3770](https://eips.ethereum.org/EIPS/eip-3770) address, or an ENS name.
Defaults to the Safe when `--safe` is used, and to the `OMNIPIN_PK` address
otherwise.

### `safe`

Use when the name is owned by a [Safe](https://safe.global). Instead of sending
transactions, the command writes `resolver-setup.json` for the
[Safe Transaction Builder](https://help.safe.global/en/articles/234052-transaction-builder).
The Safe becomes the resolver admin, and `OMNIPIN_PK` is not needed.

```sh
omnipin resolver-setup omnipin.eth --safe eth:0xOwnerSafe --role-address <address>
```

### `chain`

- Default: `mainnet`
- Options: `mainnet`, `sepolia`

EVM Chain to use.

### `resolver`

Use an existing ENSv2 permissioned resolver instead of resolving the name's
current resolver or deploying a new one. The command still points the name at
this resolver if it does not already use it.

### `salt`

CREATE2 salt for a new resolver deployment. By default a fresh random salt is
used (matching the ENS portal), and the predicted resolver address is printed.

### `rpc-url`

Custom Ethereum RPC. By default, [Public nodes](https://ethereum-rpc.publicnode.com) are used.

### `dry-run`

Simulate the setup transactions without sending them or writing
`resolver-setup.json`.

### `verbose`

More verbose logs.

## After setup

Deploy with the account that received the role:

```sh
OMNIPIN_PK=<role key> omnipin deploy --ens omnipin.eth
```

If the role went to a Safe, `OMNIPIN_PK` is a proposer of that Safe and the
update is proposed for its owners to confirm:

```sh
OMNIPIN_PK=<proposer key> omnipin deploy --ens omnipin.eth --safe eth:0xDeploySafe
```

## Re-creating records

On a newly deployed resolver, the name owner holds every role and can set any
record. The setters take the DNS-encoded name rather than the namehash. For
`myapp.eth` that is `0x056d796170700365746800`: each label prefixed with its
length (`05` `myapp`, `03` `eth`) and a trailing `00`.

```sh
# Text record
cast send <resolver> 'setText(bytes,string,string)' \
  0x056d796170700365746800 'url' 'https://myapp.eth.limo' \
  --private-key <name owner key> --rpc-url https://ethereum-rpc.publicnode.com

# ETH address (coin type 60)
cast send <resolver> 'setAddress(bytes,uint256,bytes)' \
  0x056d796170700365746800 60 0xYourAddress \
  --private-key <name owner key> --rpc-url https://ethereum-rpc.publicnode.com
```

For a Safe owner, add the same calls to a Transaction Builder batch. The content
hash itself is set by the first deploy.

## Rotating or revoking access

To grant the role to a new account, run `resolver-setup` again with the new
`--role-address`. The name already uses the permissioned resolver, so only the
role is granted.

To revoke the old account, call `revokeRootRoles` on the resolver from the name
owner. `256` is `ROLE_SET_CONTENTHASH`:

```sh
cast send <resolver> 'revokeRootRoles(uint256,address)' 256 <old address> \
  --private-key <name owner key> --rpc-url https://ethereum-rpc.publicnode.com
```

The name owner can also point the name at a different resolver at any time,
which cuts off the role entirely.

## What the role can and cannot do

The role is granted on the resolver as a whole, not on a single name. Whoever
holds it:

- **can** set the content hash of every name that uses this resolver, including
  subnames that have no resolver of their own and fall back to it
- **cannot** transfer the name, change its resolver, change any other record,
  or grant roles

Use a separate resolver for each project, and don't point unrelated names at it.
