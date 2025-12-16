<div align="center">

<img src="logo.svg" height="75" width="75" />
<h1>Omnipin</h1>

[![GitHub Workflow
Status][gh-actions-img]][github-actions] ![npm](https://img.shields.io/npm/dt/omnipin?style=for-the-badge&logo=npm&color=%232B4AD4&label) <a href="https://www.drips.network/app/projects/github/omnipin/omnipin" target="_blank"><img src="https://www.drips.network/api/embed/project/https%3A%2F%2Fgithub.com%2Fomnipin%2Fomnipin/support.png?background=blue&style=drips&text=project&stat=none" alt="Support omnipin on drips.network" height="32"></a>

<sub>The ultimate decentralized website deployment toolkit</sub>
</div>

**Omnipin** is a trustless command-line website deployment tool with
automatic content replication and secure ENS updates, powered by
Safe. No sign up required.

## Features

- **Replicate anywhere**. Pin the website to independent storage providers in one command.
- **Multiple storage protocols**. Complete IPFS and Swarm integration.
- **Use your existing ENS or DNS name**. Automatic updates of [ENS](https://ens.domains) names and DNS names through [DNSLink](https://dnslink.dev).
- **Protected with Safe**. Multiple integrations for every security need.
- **Tiny size**. Less than 1MB single file distribution.
- **Perfect for automation**. Instant install, CI/CD pipeline templates.

## Docs

Read the [docs](https://omnipin.eth.link).

## What people say

### "Most flexibility, lowest trust assumptions"

> Walletbeat uses Omnipin to deploy to IPFS. It was selected after [contrasting it against many other web3 deployment options](https://github.com/walletbeat/walletbeat/blob/beta/governance/decisions/2025-walletbeat-hosting.md), and Omnipin stood out as the one with the most flexibility, user control, lowest trust assumptions, lowest-dependency, and not locked into any specific provider.
>
> Omnipin makes it easy to automate deployment to multiple IPFS providers for redundancy, gate deployment success by actual replication and availability on popular IPFS gateways for reliability, and to update the onchain ENS records to point to the deployed IPFS CID to boot (without granting CI any authority beyond ENS record updates). Runs great with Helios too.
>
> In other words, Omnipin is the missing deployment tool that makes it feasible to adopt the cypherpunk standards and technologies that web3 frontends should strive to adopt. No more excuses now.
>
> — [polymutex.eth](https://farcaster.xyz/polymutex.eth), core dev of WalletBeat

[github-actions]: https://github.com/omnipin/omnipin/actions
[gh-actions-img]: https://img.shields.io/github/actions/workflow/status/omnipin/omnipin/ci.yml?branch=main&style=for-the-badge&logo=github&label=&color=%232B4AD4
