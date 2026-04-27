import fs from 'node:fs';
import path from 'node:path';

const appRoot = process.cwd();
const appJsonPath = path.join(appRoot, 'app.json');
const env = loadEnv();
const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8')).expo;

const checks = [
  check(
    '앱 이름',
    typeof appConfig.name === 'string' && appConfig.name.length >= 2,
    `name=${appConfig.name ?? 'missing'}`,
  ),
  check(
    'iOS Bundle ID',
    typeof appConfig.ios?.bundleIdentifier === 'string' &&
      appConfig.ios.bundleIdentifier.includes('.'),
    `bundleIdentifier=${appConfig.ios?.bundleIdentifier ?? 'missing'}`,
  ),
  check(
    '버전/빌드 번호',
    Boolean(appConfig.version && appConfig.ios?.buildNumber),
    `version=${appConfig.version ?? 'missing'}, buildNumber=${
      appConfig.ios?.buildNumber ?? 'missing'
    }`,
  ),
  check(
    '앱 아이콘',
    fileExists(appConfig.icon),
    `icon=${appConfig.icon ?? 'missing'}`,
  ),
  check(
    '위치 권한 문구',
    hasLocationPermissionCopy(appConfig),
    'NSLocationWhenInUseUsageDescription 또는 expo-location permission 필요',
  ),
  check(
    '수출 규정 기본값',
    appConfig.ios?.infoPlist?.ITSAppUsesNonExemptEncryption === false,
    'ITSAppUsesNonExemptEncryption=false 필요',
  ),
  check(
    '상품 검색 서버 HTTPS',
    isHttpsUrl(env.EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL),
    'EXPO_PUBLIC_PRODUCT_SEARCH_BASE_URL은 TestFlight/App Store에서 HTTPS여야 합니다.',
  ),
];

const failedChecks = checks.filter((item) => !item.ok);

console.log('Release readiness');
checks.forEach((item) => {
  console.log(`${item.ok ? 'OK' : 'BLOCK'} ${item.name}: ${item.detail}`);
});

if (failedChecks.length > 0) {
  process.exitCode = 1;
}

function check(name, ok, detail) {
  return { name, ok, detail };
}

function fileExists(relativePath) {
  return (
    typeof relativePath === 'string' &&
    fs.existsSync(path.resolve(appRoot, relativePath))
  );
}

function hasLocationPermissionCopy(config) {
  const plugin = (config.plugins ?? []).find((entry) => {
    if (Array.isArray(entry)) {
      return entry[0] === 'expo-location';
    }

    return entry === 'expo-location';
  });
  const pluginOptions = Array.isArray(plugin) ? plugin[1] : null;

  return Boolean(
    config.ios?.infoPlist?.NSLocationWhenInUseUsageDescription ||
      pluginOptions?.locationWhenInUsePermission,
  );
}

function isHttpsUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function loadEnv() {
  const nextEnv = { ...process.env };

  ['.env.local', '.env'].forEach((filename) => {
    const filePath = path.join(appRoot, filename);

    if (!fs.existsSync(filePath)) {
      return;
    }

    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .forEach((line) => {
        const trimmed = line.trim();

        if (trimmed.length === 0 || trimmed.startsWith('#')) {
          return;
        }

        const equalsIndex = trimmed.indexOf('=');

        if (equalsIndex === -1) {
          return;
        }

        const key = trimmed.slice(0, equalsIndex).trim();

        if (nextEnv[key] != null) {
          return;
        }

        nextEnv[key] = trimmed
          .slice(equalsIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
      });
  });

  return nextEnv;
}
