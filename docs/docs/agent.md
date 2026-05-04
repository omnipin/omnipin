---
title: Agent Skill
---

# Agent Skill

Omnipin ships an [agent skill](https://agentskills.io) that teaches AI coding agents (Claude Code, Cursor, Codex, OpenCode, and [50+ others](https://github.com/vercel-labs/skills#supported-agents)) how to deploy a project with Omnipin end-to-end.

The skill knows:

- which environment variables each [IPFS](/docs/ipfs) and [Swarm](/docs/swarm) provider requires
- the constraint that Swarm and IPFS providers cannot be combined in a single deploy
- how to ask whether to update an [ENS](/cli/ens) contenthash
- how to ask whether to sign with an EOA, a [Safe](/docs/how-it-works) delegate, or a [Zodiac Roles](/docs/how-it-works#zodiac-roles) module
- how to optionally update [DNSLink](/docs/dnslink) via Cloudflare

When invoked, the agent walks the user through provider selection, collects the required `OMNIPIN_*` variables into `.env`, and composes the right `omnipin deploy` command.

## Install

The skill is published from the [`omnipin/omnipin`](https://github.com/omnipin/omnipin) repo under `skills/omnipin-deploy`. Install it with the [`skills`](https://github.com/vercel-labs/skills) CLI:

::: code-group

```sh [bun]
bunx skills add omnipin/omnipin --skill omnipin-deploy
```

```sh [npm]
npx skills add omnipin/omnipin --skill omnipin-deploy
```

```sh [pnpm]
pnpm dlx skills add omnipin/omnipin --skill omnipin-deploy
```

:::

By default this installs the skill into your current project (e.g. `.claude/skills/omnipin-deploy`). To make it available across all projects, install globally:

```sh
bunx skills add omnipin/omnipin --skill omnipin-deploy -g
```

To install for specific agents only:

```sh
bunx skills add omnipin/omnipin --skill omnipin-deploy -a claude-code -a opencode
```

## Usage

Once installed, just ask your agent to deploy:

> Deploy this site with Omnipin

The agent will:

1. Ask which providers to deploy to (IPFS or Swarm).
2. Prompt for the env vars required by each provider and write them to `.env`.
3. Ask whether to update an ENS contenthash.
4. If yes, ask whether to sign with:
   - **EOA** — `OMNIPIN_PK` set to the ENS name manager's private key
   - **Safe with a delegate** — `OMNIPIN_PK` set to a delegate's private key (configured in Safe settings); proposes a transaction to the Safe Transaction Service for owners to confirm
   - **Safe with Zodiac Roles** — submits onchain via a restricted role
5. Ask whether to update DNSLink via Cloudflare.
6. Run the composed `omnipin deploy` command.

## Updating

```sh
bunx skills update omnipin-deploy
```

## Removing

```sh
bunx skills remove omnipin-deploy
```
