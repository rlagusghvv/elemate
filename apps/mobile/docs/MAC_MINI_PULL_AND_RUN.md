# Mac mini pull and run guide

Use this guide on the always-on Mac mini.

## 1. Install basics

```sh
xcode-select --install
```

If Homebrew is not installed, install it from https://brew.sh first. Then:

```sh
brew install git node
```

## 2. Give the Mac mini read access to the repo

Create an SSH key on the Mac mini:

```sh
ssh-keygen -t ed25519 -C "otnal-mac-mini" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

Add the printed public key to GitHub as a read-only deploy key for:

```txt
git@github.com:rlagusghvv/elemate.git
```

Then test:

```sh
ssh -T git@github.com
```

## 3. Clone the code

```sh
mkdir -p ~/Documents/Playground
git clone git@github.com:rlagusghvv/elemate.git ~/Documents/Playground/elemate
cd ~/Documents/Playground/elemate/apps/mobile
```

## 4. Configure server secrets

```sh
cp .env.example .env.local
open -e .env.local
```

Fill only these server values:

```sh
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
PORT=8787
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
```

Do not commit `.env.local`.

## 5. Bootstrap and keep running

```sh
cd ~/Documents/Playground/elemate/apps/mobile
npm run server:bootstrap
```

This runs `npm ci`, installs the LaunchAgent, starts the product search proxy, and prints server status.

Check anytime:

```sh
npm run server:status
curl http://127.0.0.1:8787/health
```

## 6. Pull updates later

```sh
cd ~/Documents/Playground/elemate/apps/mobile
npm run server:sync
```

Or explicitly:

```sh
zsh scripts/sync-and-restart-server.sh main
```

## 7. Public HTTPS endpoint

The iOS app cannot use the Mac mini's local `http://127.0.0.1:8787` endpoint in TestFlight/App Store builds. Put HTTPS in front of it:

```txt
iOS app -> https://api.your-domain.example -> Mac mini 127.0.0.1:8787 -> Naver
```

Once the HTTPS domain is ready, build the app with:

```sh
EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL=https://api.your-domain.example npm run release:check
EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL=https://api.your-domain.example npm run release:ios:build
```
