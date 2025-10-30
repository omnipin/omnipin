# Why Omnipin?

## Fragility of classic front-ends

Decentralized web hosting is often an overlooked aspect with dApp infrastructure. While the underlying smart contracts are open, permissionless and verifiable, the front-end itself is usually hosted on some central hosting service, such as Vercel or Netlify.

The crypto industry has faced numerous cases of different front-end attacks resulting in loss of millions of dollars, ranging from DNS hijacks to developer machine compromises.

- [PancakeSwap DNS hijack in 2021](https://x.com/PancakeSwap/status/1371470368058183687)
- [Convex Finance DNS hijack in 2022](https://x.com/ConvexFinance/status/1540104036229185536)
- [Ribbon Finance DNS hijack in 2022](https://x.com/ribbonfinance/status/1540250826156871681)
- [QuickSwap front-end attack in 2022](https://x.com/QuickswapDEX/status/1525590253217660930)
- [Binance Labs Velvet Capital website compromise in 2024](https://cointelegraph.com/news/binance-labs-velvet-capital-offline-website-compromise)
- [Curve Finance DNS hijack in 2025](https://news.curve.finance/curve-domain-incident)
- [Safe front-end deployment compromise in 2025](https://www.ledger.com/blog-learning-from-the-bybit-safe-attack)

Another serious issue is censorship. Governments or platforms may want to censor dApp front-ends for their own reasons (such as sanctions or repressions), making it impossible to use the dApp other than manually sending transactions to a smart contract.

- [Uniswap GFW censorship in 2021](https://en.greatfire.org/uniswap.org)
- [Curve Finance GFW censorship in 2021](https://en.greatfire.org/curve.fi)

## IPFS is not magic

It is a common misconception that uploading files on IPFS makes them distributed across many nodes on the network. This is completely false and is not how IPFS works at all.

1. **Replication is not enforced by IPFS in any way**. Uploading a file to the network **does not** reproduce it across many other nodes. While certain storage providers may pin the same content onto their own cluster of nodes, it is still bound to the same provider. What this means is that you have to replicate content on your own.

2. **IPFS doesn't provide any guarantees on content persistence**. Storage providers may unpin or delete content at any point of time, for example if you stop paying a service subscription. The content is available on the network as long as one or more node have it and are discoverable anyhow, for example DHT.

One of the key features of Omnipin is automatic re-pinning of content for IPFS on many independent IPFS storage providers. The full list is available [here](/docs/ipfs).

[Swarm](https://ethswarm.org), on the other hand, enforces at least 4 replicas of content by default. It can be used as an alternative to IPFS hosting and is also [supported](/docs/swarm) by Omnipin.

## Decentralized vendor lock-in

Certain platforms advertise themselves as "decentralized web hosting". While the app hosted on such platform itself might be somewhat decentralized (for example using ENS instead of DNS), it does not mean that such a platform can't take the website down or just go in vain (for example because of business not going well). The reliability of the application is bound to the platform.

Omnipin does not impose such risks because it is not a platform. It is instead a tool that talks to infrastructure providers and protocols directly without middlemen. There is no "Sign Up" button. The underlying infrastucture is chosen by the user.

Omnipin never uses mutable references besides ENS and DNSLink, making sure that all of the content references are immutable and deterministic (IPFS CIDs and Swarm reference IDs). Such approach additionally provides a transparent and permanent history of website changes for an ENS name.

## Security implications of automatic updates

Any website may be updated at any time by pushing a new version without much notice or any required approval steps, by default. This is mostly how websites and web apps are updated, as a whole.

While this is indeed very convenient, such approach is not good for security. In case of developer machine compromise, there are almost no barriers for publishing an exploited version of the web app without anyone being able to stop the attacker before the damage is done. This is exactly what happened during the [Safe front-end hack](https://www.ledger.com/blog-learning-from-the-bybit-safe-attack).

Such status quo should not apply to dApps, especially financially sensitive ones where security is of upmost importance. That is the primary reason why Omnipin integrates with the [Safe Proposer Flow](https://help.safe.global/en/articles/235770-proposers) for ENS update management.

With a multi-sig wallet sitting on top of an ENS name it is possible to add an multi-factor authorization layer for website updates. It is also not required to be one of the wallet owners to propose ENS updates, which significantly minimizes potential damage from an owner account getting compromised.

However, such high security requirements do not apply to everybody. For that reason, Omnipin alternatively integrates with the [Zodiac Roles](https://docs.roles.gnosisguild.org) module. The module allows creating a restricted role that is only allowed to call a specific function on a specific smart contract.

Omnipin uses Zodiac Roles to create a special role that is narrowed to only ENS website reference on an ENS name's resolver. Such integration provides moderate security benefits to users who do not wish to have a mult-factor authorization flow.
