# App Store release checklist

## Current app config

- App name: `옷날`
- Bundle ID: `com.kimhyeonho.otnal`
- Version: `1.0.0`
- Build number: `1`
- Location permission: weather-based recommendations only
- Export compliance default: `ITSAppUsesNonExemptEncryption=false`

## Before TestFlight

1. Expose the product search proxy through HTTPS.
2. Build with `EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL=https://api.your-domain.example`.
3. Confirm release readiness:

```sh
cd /Users/kimhyeonho/Documents/Playground/apps/mobile
EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL=https://api.your-domain.example npm run release:check
npm run check
```

4. Install and log in to EAS CLI if needed:

```sh
npm install -g eas-cli
eas login
```

5. Create the iOS production build:

```sh
EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL=https://api.your-domain.example npm run release:ios:build
```

6. Submit the build:

```sh
npm run release:ios:submit
```

## App Store Connect items

- Create the app record with bundle ID `com.kimhyeonho.otnal`.
- Upload screenshots for the supported iPhone sizes.
- Add a privacy policy URL. Apple requires this for iOS apps.
- Fill App Privacy accurately. This app uses location for app functionality and sends product search queries to the proxy.
- Answer export compliance in App Store Connect. The app config sets the common "no non-exempt encryption" default, but the final answer is still the account holder's responsibility.
- Use TestFlight first, then promote the tested build to App Review.

## Official references

- [Expo: Submit to the Apple App Store](https://docs.expo.dev/submit/ios/)
- [Apple: Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Apple: App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple: Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)
