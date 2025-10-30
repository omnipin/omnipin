# Installation

Omnipin supports one of the these JavaScript runtimes: [Node.js](https://nodejs.org) (20+), [Deno](https://deno.com) (2.2.11+) and [Bun](https://bun.sh).

## JavaScript package managers

:::code-group

```bash [npm]
npm i -g omnipin
```

```bash [pnpm]
pnpm i -g omnipin
```

```bash [bun]
bun i -g omnipin
```

```bash [deno]
deno install --global --allow-read --allow-env --allow-write --allow-net npm:omnipin
```

:::

## CDN

If you don't have a package manager installed, it is possible to fetch the distribution directly from CDNs.

:::code-group

```bash [jsDelivr]
curl -o omnipin.js https://cdn.jsdelivr.net/npm/omnipin/dist/cli.js
```

```bash [unpkg]
curl -o omnipin.js https://unpkg.com/omnipin/dist/cli.js
```

```bash [nobsdelivr]
curl -o https://nobsdelivr.private.coffee/npm/omnipin/dist/cli.js
```

:::

Then run as

```sh
node ./omnipin.js deploy
```
