# CI/CD

Omnipin can be integrated with CI/CD pipelines to deploy dApps automatically.

## GitHub Actions

[`pnpm/setup`](https://github.com/pnpm/setup) installs pnpm and a runtime, then runs `pnpm install`. Set `runtime` to `bun@latest` or `deno@2` to build with Bun or Deno instead of Node.js.

```yaml
name: Deploy with Omnipin
on:
  push:
    branches: main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/setup@v3
        with:
          runtime: node@lts
      - name: Build website
        run: pnpm build
      - name: Deploy the site
        run: pnpm dlx omnipin deploy .vitepress/dist --strict --ens ${{ vars.OMNIPIN_ENS }}
        env:
          OMNIPIN_PINATA_TOKEN: ${{ secrets.OMNIPIN_PINATA_TOKEN }}
          OMNIPIN_LIGHTHOUSE_TOKEN: ${{ secrets.OMNIPIN_LIGHTHOUSE_TOKEN }}
          OMNIPIN_4EVERLAND_TOKEN: ${{ secrets.OMNIPIN_4EVERLAND_TOKEN }}
          OMNIPIN_PK: ${{ secrets.OMNIPIN_PK }}
```

## GitLab CI

Before executing the pipeline, you need to set up the following environment variables:

1. Go to your GitLab project.

2. Click Settings > CI/CD > expand the Variables section.

3. Click "Add variable" and add the API tokens in use.

4. Set them as "Masked" and "Protected" if you only want them available in protected branches (like main).

```yaml
deploy:
  stage: deploy
  image: node:22
  script:
    - pnpm i -g omnipin
    - pnpm i && pnpm build
    - omnipin deploy --strict
  only:
    - main
```
