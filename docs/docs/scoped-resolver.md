# Scoped Resolver

By default, updating an ENS content hash needs the key of the account that manages the name, and that key can do anything with the name. A scoped resolver removes that requirement. The name points at an [ENSv2 permissioned resolver](/docs/how-it-works#permissioned-resolver), and Omnipin gets a role on it that can only set the content hash.

This guide sets up a scoped resolver for a name with [`omnipin resolver-setup`](/cli/resolver-setup). It works the same whether the name is owned by a wallet (EOA) or by a Safe.

## What you need

- **The name owner**: the account that manages the name, a wallet or a Safe. It needs ETH for gas, and it is only used during setup.
- **The publisher**: the account that will receive the content hash role. Choose one:
  - a **deploy Safe** (recommended): a separate Safe whose owners confirm every deploy. A delegate key proposes the updates and has no access to the name. See [Deploy Safe](/docs/how-it-works#deploy-safe).
  - a **dedicated key**: updates the content hash without any confirmation, for unattended CI deploys.
- Omnipin [installed](/docs/install).

To generate a dedicated key (or a delegate key for the deploy Safe), use [Foundry](https://getfoundry.sh):

```sh
cast wallet new
```

:::tip
Try the whole flow on Sepolia first by adding `--chain sepolia` to every command.
:::

## 1. Save the name's current records

If the name already uses a permissioned resolver, `resolver-setup` reuses it and only grants the role. Otherwise it deploys a new resolver and points the name at it. Records stored in the old resolver (ETH address, avatar, text records, the current content hash) **do not carry over**.

Before continuing, write down the records you want to keep, e.g. from the name's page in the [ENS app](https://app.ens.domains).

## 2. Preview the setup

Run the command with `--dry-run`. It simulates every transaction from the name owner and sends nothing.

::: code-group

```sh [Name owned by a wallet]
OMNIPIN_PK=<name owner key> omnipin resolver-setup myapp.eth \
  --role-address eth:0xDeploySafeOrKey \
  --dry-run --verbose
```

```sh [Name owned by a Safe]
omnipin resolver-setup myapp.eth \
  --safe eth:0xOwnerSafe \
  --role-address eth:0xDeploySafeOrKey \
  --dry-run --verbose
```

:::

The output shows which path will be taken:

- `Using the existing permissioned resolver 0x…`: only the role is granted
- `Resolver will be deployed at 0x…`: a new resolver is deployed with a random salt, the role is granted, and the name is pointed at it
- `… already has ROLE_SET_CONTENTHASH`: nothing to do

:::warning
Pass the owner key inline as shown and run this on your own machine. Never put the name owner's key in `.env` or in CI secrets.
:::

## 3. Run the setup

Repeat the command without `--dry-run`.

- **Wallet owner**: Omnipin sends the transactions and waits for each one to be mined.
- **Safe owner**: Omnipin writes `resolver-setup.json`. Open the Safe [Transaction Builder](https://app.safe.global/apps/open?appUrl=https%3A%2F%2Fapps-portal.safe.global%2Ftx-builder) for the owner Safe, drop the file in, and execute the batch.

Note the resolver address printed by the command.

## 4. Re-create other records

The name owner receives every role on a newly deployed resolver, so it can set any record. The setters take the DNS-encoded name rather than the namehash. For `myapp.eth` that is `0x056d796170700365746800`: each label prefixed with its length (`05` `myapp`, `03` `eth`) and a trailing `00`.

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

For a Safe owner, add the same calls to a Transaction Builder batch. The content hash itself is set by the first deploy.

## 5. Deploy

::: code-group

```sh [Deploy Safe]
OMNIPIN_PK=<delegate key> omnipin deploy --ens myapp.eth --safe eth:0xDeploySafe
```

```sh [Dedicated key]
OMNIPIN_PK=<role key> omnipin deploy --ens myapp.eth
```

:::

With a deploy Safe, Omnipin proposes `setContenthash` to the Safe Transaction Service and the deploy Safe owners confirm it. With a dedicated key, the transaction is sent directly. From here on, only the delegate or role key goes into `.env` or CI secrets.

## Rotating or revoking access

To grant the role to a new account, run `resolver-setup` again with the new `--role-address`. The name already uses the permissioned resolver, so only the role is granted.

To revoke the old account, call `revokeRootRoles` on the resolver from the name owner. `256` is `ROLE_SET_CONTENTHASH`:

```sh
cast send <resolver> 'revokeRootRoles(uint256,address)' 256 <old address> \
  --private-key <name owner key> --rpc-url https://ethereum-rpc.publicnode.com
```

The name owner can also point the name at a different resolver at any time, which cuts off the role entirely.

## What the role can and cannot do

The role is granted on the resolver as a whole, not on a single name. Whoever holds it:

- **can** set the content hash of every name that uses this resolver, including subnames that have no resolver of their own and fall back to it
- **cannot** transfer the name, change its resolver, change any other record, or grant roles

Use a separate resolver for each project, and don't point unrelated names at it.
