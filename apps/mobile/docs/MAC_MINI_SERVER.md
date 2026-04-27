# Mac mini product search server

This server keeps Naver Shopping Search credentials off the iOS app. The app calls this proxy, and the proxy calls Naver.

## One-time setup on the Mac mini

Full clone/setup guide: [MAC_MINI_PULL_AND_RUN.md](./MAC_MINI_PULL_AND_RUN.md).

```sh
cd /Users/kimhyeonho/Documents/Playground/apps/mobile
npm install
cp .env.example .env.local
```

Fill `.env.local` on the Mac mini:

```sh
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
PORT=8787
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
```

Do not put `NAVER_CLIENT_ID` or `NAVER_CLIENT_SECRET` into `EXPO_PUBLIC_` variables. Anything prefixed with `EXPO_PUBLIC_` can be bundled into the app.

## Run continuously with LaunchAgent

```sh
cd /Users/kimhyeonho/Documents/Playground/apps/mobile
npm run server:bootstrap
npm run server:status
```

Useful commands:

```sh
tail -f ~/Library/Logs/otnal/product-search-proxy.out.log
tail -f ~/Library/Logs/otnal/product-search-proxy.err.log
npm run server:uninstall
```

If port `8787` is already occupied by an old manual run:

```sh
lsof -nP -iTCP:8787 -sTCP:LISTEN
kill <PID>
npm run server:install
```

## Production requirement

For TestFlight/App Store, the app must call an HTTPS endpoint, not a local USB/LAN URL.

Recommended shape:

```txt
iOS app -> https://api.your-domain.example -> Mac mini localhost:8787 -> Naver Shopping Search API
```

If using Caddy on the Mac mini, the reverse proxy can be as small as:

```Caddyfile
api.your-domain.example {
  reverse_proxy 127.0.0.1:8787
}
```

Then build the app with:

```sh
EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL=https://api.your-domain.example npm run release:check
EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL=https://api.your-domain.example npm run release:ios:build
```
