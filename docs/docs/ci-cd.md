# CI/CD

Blumen can be integrated with CI/CD pipelines to deploy dApps automatically.

## GitHub Actions

Blumen uses this GitHub Action to deploy it's own website.

```yaml
name: Deploy with Blumen
on:
  push:
    branches: main
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Install Blumen
        run: bun i -g blumen@1.2.1
      - name: Build website
        run: bun i && bun run build
      - name: Deploy the site
        run: blumen deploy .vitepress/dist --strict --ens ${{ vars.BLUMEN_ENS }} --safe ${{ vars.BLUMEN_SAFE }}
        env:
          BLUMEN_PINATA_TOKEN: ${{ secrets.BLUMEN_PINATA_TOKEN }}
          BLUMEN_STORACHA_PROOF: ${{ secrets.BLUMEN_STORACHA_PROOF }}
          BLUMEN_STORACHA_TOKEN: ${{ secrets.BLUMEN_STORACHA_TOKEN }}
          BLUMEN_LIGHTHOUSE_TOKEN: ${{ secrets.BLUMEN_LIGHTHOUSE_TOKEN }}
          BLUMEN_4EVERLAND_TOKEN: ${{ secrets.BLUMEN_4EVERLAND_TOKEN }}
          BLUMEN_PK: ${{ secrets.BLUMEN_PK }}
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
    - pnpm i -g blumen@1.2.1
    - pnpm i && pnpm build
    - blumen deploy --strict
  only:
    - main
```
