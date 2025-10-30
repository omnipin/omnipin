# CI/CD

Omnipin can be integrated with CI/CD pipelines to deploy dApps automatically.

## GitHub Actions

Omnipin uses this GitHub Action to deploy it's own website.

```yaml
name: Deploy with Omnipin
on:
  push:
    branches: main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Install Omnipin
        run: bun i -g omnipin@1.2.1
      - name: Build website
        run: bun i && bun run build
      - name: Deploy the site
        run: omnipin deploy .vitepress/dist --strict --ens ${{ vars.OMNIPIN_ENS }} --safe ${{ vars.OMNIPIN_SAFE }}
        env:
          OMNIPIN_PINATA_TOKEN: ${{ secrets.OMNIPIN_PINATA_TOKEN }}
          OMNIPIN_STORACHA_PROOF: ${{ secrets.OMNIPIN_STORACHA_PROOF }}
          OMNIPIN_STORACHA_TOKEN: ${{ secrets.OMNIPIN_STORACHA_TOKEN }}
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
    - pnpm i -g omnipin@1.2.1
    - pnpm i && pnpm build
    - omnipin deploy --strict
  only:
    - main
```
