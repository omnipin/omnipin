# `omnipin ping`

Ping an endpoint until it resolves content.

```sh
omnipin ping <cid> <gateway url>
```

## Options

### `max-retries`

Default: `Infinity`

Amount of retries after which pinging stops if it failed to resolve before.

### `retry-interval`

Default: 5 seconds

Interval between retries (in ms)

### `timeout`

Default: 10 seconds

Request timeout until next attempt (in ms)
