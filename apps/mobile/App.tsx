import { StatusBar } from 'expo-status-bar';
import {
  IBMPlexSansKR_400Regular,
  IBMPlexSansKR_500Medium,
  IBMPlexSansKR_600SemiBold,
  IBMPlexSansKR_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-kr';
import * as Location from 'expo-location';
import {
  startTransition,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  appendCustomClosetItem,
  buildClosetCatalog,
  buildClosetProfile,
  categoryDefinitions,
  commuteModeOptions,
  createStarterClosetState,
  feedbackLabels,
  getCategoryLabel,
  hasEssentialCloset,
  notificationTimeOptions,
  styleTagOptions,
  temperatureBiasOptions,
  type ClosetCategoryKey,
  type ClosetItem,
  type ClosetState,
  type CommuteModeKey,
  type FeedbackKey,
  type NotificationTimeKey,
  type TabKey,
  type TemperatureBiasKey,
} from './src/data/sample-data';
import { analyzeProductName } from './src/services/product-name-analysis';
import {
  hasProductSearchProxy,
  searchProducts,
  type ProductSearchResult,
} from './src/services/product-search';
import {
  DEFAULT_LOCATION,
  buildFallbackWeatherSnapshot,
  fetchWeatherSnapshot,
  type ResolvedLocation,
  type WeatherSnapshot,
} from './src/services/open-meteo';
import {
  loadClosetState,
  saveClosetState,
} from './src/services/closet-storage';
import { palette, shadows, typography } from './src/theme';
import {
  buildOutfitRecommendation,
  describeWindStrength,
  type OutfitRecommendation,
} from './src/utils/outfit-recommendation';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'today', label: '오늘 추천' },
  { key: 'closet', label: '옷장' },
];

type WeatherSceneVariant =
  | 'clear-day'
  | 'partly-cloudy-day'
  | 'cloudy-day'
  | 'rainy-day'
  | 'snowy-day'
  | 'clear-night';

type AtmosphereTone = {
  topWash: string;
  shade: string;
  bottomMist: string;
};

type WeatherScene = {
  source: ImageSourcePropType;
  tone: AtmosphereTone;
};

const weatherScenes: Record<WeatherSceneVariant, WeatherScene> = {
  'clear-day': {
    source: require('./assets/weather-clear-day.png'),
    tone: {
      topWash: 'rgba(130, 171, 231, 0.08)',
      shade: 'rgba(41, 73, 126, 0.16)',
      bottomMist: 'rgba(21, 46, 90, 0.26)',
    },
  },
  'partly-cloudy-day': {
    source: require('./assets/weather-partly-cloudy-day.png'),
    tone: {
      topWash: 'rgba(141, 182, 239, 0.08)',
      shade: 'rgba(38, 71, 124, 0.18)',
      bottomMist: 'rgba(24, 49, 91, 0.28)',
    },
  },
  'cloudy-day': {
    source: require('./assets/weather-cloudy-day.png'),
    tone: {
      topWash: 'rgba(153, 171, 203, 0.06)',
      shade: 'rgba(34, 56, 92, 0.28)',
      bottomMist: 'rgba(22, 38, 70, 0.34)',
    },
  },
  'rainy-day': {
    source: require('./assets/weather-rainy-day.png'),
    tone: {
      topWash: 'rgba(108, 129, 167, 0.04)',
      shade: 'rgba(17, 34, 65, 0.36)',
      bottomMist: 'rgba(11, 23, 46, 0.38)',
    },
  },
  'snowy-day': {
    source: require('./assets/weather-snowy-day.png'),
    tone: {
      topWash: 'rgba(198, 221, 255, 0.08)',
      shade: 'rgba(53, 84, 130, 0.18)',
      bottomMist: 'rgba(31, 57, 99, 0.24)',
    },
  },
  'clear-night': {
    source: require('./assets/weather-clear-night.png'),
    tone: {
      topWash: 'rgba(17, 31, 63, 0.06)',
      shade: 'rgba(6, 15, 35, 0.30)',
      bottomMist: 'rgba(4, 10, 24, 0.44)',
    },
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    IBMPlexSansKR_400Regular,
    IBMPlexSansKR_500Medium,
    IBMPlexSansKR_600SemiBold,
    IBMPlexSansKR_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={styles.screen} />;
  }

  return (
    <SafeAreaProvider>
      <AppScreen />
    </SafeAreaProvider>
  );
}

function Text(props: TextProps) {
  const { style, ...rest } = props;

  return (
    <NativeText
      {...rest}
      style={[
        styles.appText,
        style,
        { fontFamily: resolveTextFontFamily(style) },
      ]}
    />
  );
}

function resolveTextFontFamily(style: TextProps['style']) {
  const flattenedStyle = StyleSheet.flatten(style);
  const fontWeight = flattenedStyle?.fontWeight;

  if (fontWeight === '700' || fontWeight === 'bold') {
    return typography.bold;
  }

  if (fontWeight === '600') {
    return typography.semibold;
  }

  if (fontWeight === '500') {
    return typography.medium;
  }

  return typography.regular;
}

function AppScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [selectedFeedback, setSelectedFeedback] =
    useState<FeedbackKey>('perfect');
  const [productDraft, setProductDraft] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [closetState, setClosetState] = useState<ClosetState>(
    createStarterClosetState(),
  );
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [activeLocation, setActiveLocation] =
    useState<ResolvedLocation>(DEFAULT_LOCATION);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydratingCloset, setIsHydratingCloset] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  useEffect(() => {
    void refreshWeather(DEFAULT_LOCATION, { mode: 'initial' });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const storedState = await loadClosetState();

        if (!cancelled) {
          setClosetState(storedState);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice('옷장 설정을 불러오지 못했어요.');
        }
      } finally {
        if (!cancelled) {
          setIsHydratingCloset(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isHydratingCloset) {
      return;
    }

    void saveClosetState(closetState).catch(() => {
      setNotice('옷장 설정을 저장하지 못했어요.');
    });
  }, [closetState, isHydratingCloset]);

  const closetProfile = buildClosetProfile(closetState);
  const closetCatalogSnapshot = buildClosetCatalog(closetState);
  const isClosetReady = hasEssentialCloset(closetState);
  const recommendation =
    weather == null || !isClosetReady
      ? null
      : buildOutfitRecommendation(weather, selectedFeedback, closetProfile);
  const scene = weatherScenes[getWeatherSceneVariant(weather)];

  function updateClosetState(
    updater: (current: ClosetState) => ClosetState,
  ) {
    setClosetState((current) => updater(current));
  }

  function toggleClosetItem(category: ClosetCategoryKey, itemId: string) {
    updateClosetState((current) => {
      const selectedIds = current.selectedItemIds[category];
      const nextIds = selectedIds.includes(itemId)
        ? selectedIds.filter((id) => id !== itemId)
        : [...selectedIds, itemId];

      return {
        ...current,
        selectedItemIds: {
          ...current.selectedItemIds,
          [category]: nextIds,
        },
      };
    });
  }

  function updateTemperatureBias(nextBias: TemperatureBiasKey) {
    updateClosetState((current) => ({
      ...current,
      preference: {
        ...current.preference,
        temperatureBias: nextBias,
      },
    }));
  }

  function updateCommuteMode(nextMode: CommuteModeKey) {
    updateClosetState((current) => ({
      ...current,
      preference: {
        ...current.preference,
        commuteMode: nextMode,
      },
    }));
  }

  function updateNotificationTime(nextTime: NotificationTimeKey) {
    updateClosetState((current) => ({
      ...current,
      preference: {
        ...current.preference,
        notificationTime: nextTime,
      },
    }));
  }

  function toggleStyleTag(tag: string) {
    updateClosetState((current) => {
      const nextTags = current.preference.tags.includes(tag)
        ? current.preference.tags.filter((currentTag) => currentTag !== tag)
        : [...current.preference.tags, tag];

      return {
        ...current,
        preference: {
          ...current.preference,
          tags: nextTags,
        },
      };
    });
  }

  function resetClosetToStarter() {
    setClosetState(createStarterClosetState());
    setSearchResults([]);
    setProductDraft('');
    setNotice('기본 옷장으로 다시 채웠어요.');
  }

  function handleAnalyzeProduct() {
    const analysis = analyzeProductName(productDraft);

    if (analysis == null) {
      setNotice('상품명을 조금 더 구체적으로 입력해 주세요.');
      return;
    }

    let nextNotice = `${analysis.item.name}을 ${analysis.summary} 기준으로 추가했어요.`;

    updateClosetState((current) => {
      const existing = findExistingCatalogItemByName(
        buildClosetCatalog(current),
        analysis.item.name,
      );

      if (existing != null) {
        nextNotice = `${existing.item.name}은(는) 이미 ${getCategoryLabel(
          existing.category,
        )}에 있어요. 선택만 반영했어요.`;

        return {
          ...current,
          selectedItemIds: {
            ...current.selectedItemIds,
            [existing.category]: [
              ...new Set([
                ...current.selectedItemIds[existing.category],
                existing.item.id,
              ]),
            ],
          },
        };
      }

      return appendCustomClosetItem(current, analysis.category, analysis.item);
    });

    setProductDraft('');
    setNotice(nextNotice);
  }

  async function handleSearchProducts() {
    const trimmedQuery = productDraft.trim();

    if (trimmedQuery.length < 2) {
      setNotice('브랜드나 상품명을 두 글자 이상 입력해 주세요.');
      return;
    }

    setIsSearchingProducts(true);

    try {
      const results = await searchProducts(trimmedQuery);

      startTransition(() => {
        setSearchResults(results);
        setNotice(
          results.length > 0
            ? `${results.length}개의 실제 상품 결과를 찾았어요.`
            : '검색 결과가 없어서 직접 분석 모드로 추가해 보세요.',
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (
        message === 'PRODUCT_SEARCH_PROXY_MISSING' ||
        message === 'NAVER_SEARCH_CREDENTIALS_MISSING'
      ) {
        setNotice('실제 검색을 쓰려면 네이버 쇼핑 검색 API 키가 필요해요.');
      } else {
        setNotice('실제 상품 검색 결과를 불러오지 못했어요.');
      }

      setSearchResults([]);
    } finally {
      setIsSearchingProducts(false);
    }
  }

  function handleAddSearchResult(result: ProductSearchResult) {
    const analysis = analyzeProductName(
      [result.brand, result.title, ...result.categories].filter(Boolean).join(' '),
    );
    const normalizedName =
      result.brand.length > 0 && !result.title.includes(result.brand)
        ? `${result.brand} ${result.title}`
        : result.title;

    if (analysis == null) {
      setNotice('상품 정보를 분석하지 못했어요. 직접 분석 모드로 시도해 주세요.');
      return;
    }

    const nextItem: ClosetItem = {
      ...analysis.item,
      name: normalizedName,
      role: buildSearchDerivedRole(result, analysis.summary),
      source: 'name-analysis',
    };

    let nextNotice = `${nextItem.name}을(를) ${getCategoryLabel(
      analysis.category,
    )}에 추가했어요.`;

    updateClosetState((current) => {
      const existing = findExistingCatalogItemByName(
        buildClosetCatalog(current),
        nextItem.name,
      );

      if (existing != null) {
        nextNotice = `${existing.item.name}은(는) 이미 ${getCategoryLabel(
          existing.category,
        )}에 있어요. 선택만 반영했어요.`;

        return {
          ...current,
          selectedItemIds: {
            ...current.selectedItemIds,
            [existing.category]: [
              ...new Set([
                ...current.selectedItemIds[existing.category],
                existing.item.id,
              ]),
            ],
          },
        };
      }

      return appendCustomClosetItem(current, analysis.category, nextItem);
    });

    setProductDraft('');
    setSearchResults([]);
    setNotice(nextNotice);
  }

  async function refreshWeather(
    location: ResolvedLocation,
    options: { mode?: 'initial' | 'refresh' } = {},
  ) {
    const isInitial = options.mode === 'initial' || weather == null;

    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const nextWeather = await fetchWeatherSnapshot(location);

      startTransition(() => {
        setWeather(nextWeather);
        setActiveLocation(location);
        setNotice(null);
      });
    } catch (error) {
      const fallback = buildFallbackWeatherSnapshot(location);

      startTransition(() => {
        if (weather == null) {
          setWeather(fallback);
        }

        setNotice('실시간 날씨를 불러오지 못했어요.');
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  async function handleUseCurrentLocation() {
    setIsLocating(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        setNotice('위치 권한이 없어서 기본 위치를 쓰고 있어요.');
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: 15 * 60 * 1000,
        requiredAccuracy: 500,
      });
      const currentPosition =
        lastKnown ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));

      const placemarks = await Location.reverseGeocodeAsync({
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      });
      const placemark = placemarks[0];

      await refreshWeather(
        {
          latitude: currentPosition.coords.latitude,
          longitude: currentPosition.coords.longitude,
          label: formatLocationLabel(placemark),
          region: formatRegionLabel(placemark),
          source: 'device',
        },
        { mode: 'refresh' },
      );
    } catch (error) {
      setNotice('현재 위치를 확인하지 못했어요.');
    } finally {
      setIsLocating(false);
    }
  }

  return (
    <View style={styles.screen}>
      <AtmosphereScene scene={scene} />
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(insets.top + 12, 30) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.headerDate}>
              {weather ? weather.today.dateLabel : '오늘'}
            </Text>
            <Text style={styles.headerTitle}>오늘 뭐 입지</Text>
            <Text style={styles.headerMeta}>
              {weather
                ? `${activeLocation.label} · ${weather.current.updatedAtLabel} 업데이트`
                : `${activeLocation.label} 기준`}
            </Text>
          </View>

          <View style={styles.tabBar}>
            {tabs.map((tab) => {
              const active = activeTab === tab.key;

              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={styles.tabButton}
                >
                  <Text
                    style={[styles.tabText, active && styles.tabTextActive]}
                  >
                    {tab.label}
                  </Text>
                  <View
                    style={[
                      styles.tabIndicator,
                      active && styles.tabIndicatorShown,
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          {isLoading || isHydratingCloset || weather == null ? (
            <LoadingCard />
          ) : activeTab === 'today' ? (
            <TodayTab
              closetProfile={closetProfile}
              isClosetReady={isClosetReady}
              isLocating={isLocating}
              isRefreshing={isRefreshing}
              onOpenCloset={() => setActiveTab('closet')}
              onRefresh={() =>
                void refreshWeather(activeLocation, { mode: 'refresh' })
              }
              onUseCurrentLocation={handleUseCurrentLocation}
              recommendation={recommendation}
              selectedFeedback={selectedFeedback}
              weather={weather}
              onFeedbackSelect={setSelectedFeedback}
            />
          ) : (
            <ClosetTab
              closetCatalog={closetCatalogSnapshot}
              closetProfile={closetProfile}
              closetState={closetState}
              onCommuteModeChange={updateCommuteMode}
              onAnalyzeProduct={handleAnalyzeProduct}
              onAddSearchResult={handleAddSearchResult}
              onNotificationTimeChange={updateNotificationTime}
              onSearchProducts={handleSearchProducts}
              onProductDraftChange={setProductDraft}
              onReset={resetClosetToStarter}
              productSearchAvailable={hasProductSearchProxy()}
              productSearchResults={searchResults}
              onTemperatureBiasChange={updateTemperatureBias}
              onToggleItem={toggleClosetItem}
              onToggleTag={toggleStyleTag}
              productDraft={productDraft}
              isSearchingProducts={isSearchingProducts}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function AtmosphereScene(props: { scene: WeatherScene }) {
  return (
    <View pointerEvents="none" style={styles.scene}>
      <ImageBackground
        source={props.scene.source}
        style={styles.scene}
        imageStyle={styles.sceneImage}
      >
        <View
          style={[
            styles.sceneTopWash,
            { backgroundColor: props.scene.tone.topWash },
          ]}
        />
        <View
          style={[styles.sceneShade, { backgroundColor: props.scene.tone.shade }]}
        />
        <View
          style={[
            styles.sceneMistBottom,
            { backgroundColor: props.scene.tone.bottomMist },
          ]}
        />
      </ImageBackground>
    </View>
  );
}

function TodayTab(props: {
  closetProfile: ReturnType<typeof buildClosetProfile>;
  isClosetReady: boolean;
  weather: WeatherSnapshot;
  recommendation: OutfitRecommendation | null;
  selectedFeedback: FeedbackKey;
  onFeedbackSelect: (feedback: FeedbackKey) => void;
  onOpenCloset: () => void;
  onUseCurrentLocation: () => void;
  onRefresh: () => void;
  isLocating: boolean;
  isRefreshing: boolean;
}) {
  const missingSections = getMissingClosetSections(props.closetProfile);

  if (!props.isClosetReady || props.recommendation == null) {
    return (
      <View style={styles.stack}>
        <View style={styles.recommendationCard}>
          <View style={styles.recommendationTop}>
            <View style={styles.recommendationMeta}>
              <Tag label={props.weather.locationLabel} />
              <Tag label={props.weather.current.weatherLabel} />
            </View>
            <Text style={styles.temperatureText}>
              {Math.round(props.weather.current.temperature)}°
            </Text>
          </View>

          <Text style={styles.recommendationTitle}>
            옷장만 정리하면 아침 추천이 바로 시작돼요
          </Text>
          <Text style={styles.recommendationLead}>
            상의, 하의, 신발을 한 번만 골라두면 이 날씨 화면에서 바로 추천합니다.
          </Text>

          <Pressable onPress={props.onOpenCloset} style={styles.primaryActionButton}>
            <Text style={styles.primaryActionButtonText}>옷장 채우기</Text>
          </Pressable>
        </View>

        <View style={styles.utilityRow}>
          <Pressable
            onPress={props.onUseCurrentLocation}
            style={styles.utilityButton}
            disabled={props.isLocating}
          >
            <Text style={styles.utilityButtonText}>
              {props.isLocating ? '위치 확인 중' : '현재 위치'}
            </Text>
          </Pressable>
          <Pressable
            onPress={props.onRefresh}
            style={styles.utilityButton}
            disabled={props.isRefreshing}
          >
            <Text style={styles.utilityButtonText}>
              {props.isRefreshing ? '계산 중' : '날씨 새로고침'}
            </Text>
          </Pressable>
        </View>

        <Section title="지금 날씨" subtitle="추천 전이라도 오늘 컨디션은 바로 볼 수 있게 두었습니다.">
          <View style={styles.factList}>
            <FactRow
              label="출근 체감"
              value={`${Math.round(props.weather.periods[0].apparentTemperature)}°`}
            />
            <FactRow
              label="낮 최고"
              value={`${Math.round(props.weather.today.maxTemp)}°`}
            />
            <FactRow
              label="비 확률"
              value={`${Math.round(props.weather.today.precipitationProbabilityMax)}%`}
            />
            <FactRow
              label="바람"
              value={describeWindStrength(props.weather.current.windSpeed)}
              last
            />
          </View>
        </Section>

        <Section
          title="먼저 채워둘 항목"
          subtitle="이 세 가지만 있으면 오늘 추천이 정상 동작합니다."
        >
          {missingSections.map((section, index) => (
            <LineRow
              key={section}
              label={section}
              value="선택 필요"
              last={index === missingSections.length - 1}
            />
          ))}
        </Section>
      </View>
    );
  }

  const recommendation = props.recommendation;

  return (
    <View style={styles.stack}>
      <View style={styles.recommendationCard}>
        <View style={styles.recommendationTop}>
          <View style={styles.recommendationMeta}>
            <Tag label={props.weather.locationLabel} />
            <Tag label={props.weather.current.weatherLabel} />
          </View>
          <Text style={styles.temperatureText}>
            {Math.round(props.weather.current.temperature)}°
          </Text>
        </View>

        <Text style={styles.recommendationTitle}>
          {props.recommendation.headline}
        </Text>
        <Text style={styles.recommendationLead}>
          {buildLeadCopy(props.weather)}
        </Text>
        <Text style={styles.recommendationSummary}>
          {props.recommendation.summaryLine}
        </Text>

        <View style={styles.factList}>
          <FactRow
            label="출근 체감"
            value={`${Math.round(props.weather.periods[0].apparentTemperature)}°`}
          />
          <FactRow
            label="낮 최고"
            value={`${Math.round(props.weather.today.maxTemp)}°`}
          />
          <FactRow
            label="비 확률"
            value={`${Math.round(props.weather.today.precipitationProbabilityMax)}%`}
          />
          <FactRow
            label="바람"
            value={describeWindStrength(props.weather.current.windSpeed)}
            last
          />
        </View>
      </View>

      <View style={styles.utilityRow}>
        <Pressable
          onPress={props.onUseCurrentLocation}
          style={styles.utilityButton}
          disabled={props.isLocating}
        >
          <Text style={styles.utilityButtonText}>
            {props.isLocating ? '위치 확인 중' : '현재 위치'}
          </Text>
        </Pressable>
        <Pressable
          onPress={props.onRefresh}
          style={styles.utilityButton}
          disabled={props.isRefreshing}
        >
          <Text style={styles.utilityButtonText}>
            {props.isRefreshing ? '계산 중' : '다시 추천'}
          </Text>
        </Pressable>
      </View>

      <Section title="추천 메모">
        <View style={styles.noteBlock}>
          <Text style={styles.noteLead}>{recommendation.reasons.join(' · ')}</Text>
          <Text style={styles.noteText}>{recommendation.commuteNote}</Text>
        </View>
      </Section>

      <Section title="오늘 조합">
        {recommendation.items.map((item, index) => (
          <LineRow
            key={`${item.slot}-${item.name}`}
            label={item.slot}
            value={item.name}
            last={index === recommendation.items.length - 1}
          />
        ))}
      </Section>

      <Section title="다른 추천">
        {recommendation.alternatives.map((look, index) => (
          <AlternativeRow
            key={look.title}
            title={look.title}
            subtitle={look.subtitle}
            last={index === recommendation.alternatives.length - 1}
          />
        ))}
      </Section>

      <Section title="체감 보정">
        <View style={styles.feedbackWrap}>
          {(
            Object.entries(feedbackLabels) as Array<[FeedbackKey, string]>
          ).map(([key, label]) => {
            const active = props.selectedFeedback === key;

            return (
              <Pressable
                key={key}
                onPress={() => props.onFeedbackSelect(key)}
                style={[
                  styles.feedbackChip,
                  active && styles.feedbackChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.feedbackChipText,
                    active && styles.feedbackChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
    </View>
  );
}

function ClosetTab(props: {
  closetCatalog: Record<ClosetCategoryKey, ClosetItem[]>;
  closetState: ClosetState;
  closetProfile: ReturnType<typeof buildClosetProfile>;
  productSearchAvailable: boolean;
  productSearchResults: ProductSearchResult[];
  onTemperatureBiasChange: (key: TemperatureBiasKey) => void;
  onCommuteModeChange: (key: CommuteModeKey) => void;
  onNotificationTimeChange: (key: NotificationTimeKey) => void;
  onToggleTag: (tag: string) => void;
  onToggleItem: (category: ClosetCategoryKey, itemId: string) => void;
  onProductDraftChange: (value: string) => void;
  onAnalyzeProduct: () => void;
  onSearchProducts: () => void;
  onAddSearchResult: (result: ProductSearchResult) => void;
  onReset: () => void;
  productDraft: string;
  isSearchingProducts: boolean;
}) {
  return (
    <View style={styles.stack}>
      <View style={styles.closetCard}>
        <Text style={styles.closetCount}>{props.closetProfile.totalItems}개</Text>
        <Text style={styles.closetSummary}>
          {props.closetProfile.preference.tags.length > 0
            ? props.closetProfile.preference.tags.join(' · ')
            : '스타일 태그를 고르면 추천 무드를 더 맞출 수 있어요'}
        </Text>
        <Text style={styles.closetMeta}>
          한 번만 골라두면 {props.closetProfile.preference.notificationTime}에 이
          옷장 기준으로 추천합니다.
        </Text>
      </View>

      <Section title="상품 검색">
        <View style={styles.productInputCard}>
          <TextInput
            value={props.productDraft}
            onChangeText={props.onProductDraftChange}
            placeholder="브랜드나 상품명"
            placeholderTextColor="rgba(255,255,255,0.42)"
            style={styles.productInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={props.onSearchProducts}
          />
          <View style={styles.productInputActions}>
            <Pressable
              onPress={props.onSearchProducts}
              style={[
                styles.productInputButton,
                props.isSearchingProducts && styles.productInputButtonDisabled,
              ]}
              disabled={props.isSearchingProducts}
            >
              <Text style={styles.productInputButtonText}>
                {props.isSearchingProducts ? '검색 중' : '검색'}
              </Text>
            </Pressable>
            <Pressable
              onPress={props.onAnalyzeProduct}
              style={styles.productSecondaryButton}
            >
              <Text style={styles.productSecondaryButtonText}>직접 추가</Text>
            </Pressable>
          </View>
          {!props.productSearchAvailable ? (
            <Text style={styles.productInputWarning}>
              검색 서버 연결 필요
            </Text>
          ) : null}
        </View>
        {props.productSearchResults.length > 0 ? (
          <View style={styles.searchResultList}>
            {props.productSearchResults.map((result, index) => (
              <SearchResultRow
                key={`${result.id}-${index}`}
                item={result}
                onAdd={() => props.onAddSearchResult(result)}
                last={index === props.productSearchResults.length - 1}
              />
            ))}
          </View>
        ) : null}
      </Section>

      <Section title="내 옷장">
        {props.closetProfile.categories.map((category, index) => (
          <LineRow
            key={category.name}
            label={category.name}
            value={
              category.count > 0
                ? `${category.count}개 · ${category.highlight}`
                : '아직 비어 있음'
            }
            last={index === props.closetProfile.categories.length - 1}
          />
        ))}
      </Section>

      <Section title="추천 기준">
        <PreferenceGroup label="체감">
          {temperatureBiasOptions.map((option) => (
            <OptionChip
              key={option.key}
              active={props.closetState.preference.temperatureBias === option.key}
              label={option.label}
              onPress={() => props.onTemperatureBiasChange(option.key)}
            />
          ))}
        </PreferenceGroup>
        <PreferenceGroup label="이동">
          {commuteModeOptions.map((option) => (
            <OptionChip
              key={option.key}
              active={props.closetState.preference.commuteMode === option.key}
              label={option.label}
              onPress={() => props.onCommuteModeChange(option.key)}
            />
          ))}
        </PreferenceGroup>
        <PreferenceGroup label="알림">
          {notificationTimeOptions.map((option) => (
            <OptionChip
              key={option.key}
              active={props.closetState.preference.notificationTime === option.key}
              label={option.label}
              onPress={() => props.onNotificationTimeChange(option.key)}
            />
          ))}
        </PreferenceGroup>
        <PreferenceGroup label="스타일" last>
          {styleTagOptions.map((tag) => (
            <OptionChip
              key={tag}
              active={props.closetState.preference.tags.includes(tag)}
              label={tag}
              onPress={() => props.onToggleTag(tag)}
            />
          ))}
        </PreferenceGroup>
      </Section>

      <Section title="옷 선택">
        {categoryDefinitions.map((category, categoryIndex) => (
          <View
            key={category.key}
            style={[
              styles.categoryGroup,
              categoryIndex === categoryDefinitions.length - 1 &&
                styles.categoryGroupLast,
            ]}
          >
            <View style={styles.categoryGroupHeader}>
              <Text style={styles.categoryGroupTitle}>{category.name}</Text>
              <Text style={styles.categoryGroupCount}>
                {props.closetState.selectedItemIds[category.key].length}개 선택
              </Text>
            </View>
            {props.closetCatalog[category.key].map((item, index) => (
              <ClosetItemRow
                key={item.id}
                active={props.closetState.selectedItemIds[category.key].includes(
                  item.id,
                )}
                item={item}
                onPress={() => props.onToggleItem(category.key, item.id)}
                last={index === props.closetCatalog[category.key].length - 1}
              />
            ))}
          </View>
        ))}
      </Section>

      <View style={styles.utilityRow}>
        <Pressable onPress={props.onReset} style={styles.utilityButton}>
          <Text style={styles.utilityButtonText}>스타터로 되돌리기</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section(props: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{props.title}</Text>
        {props.subtitle ? (
          <Text style={styles.sectionSubtitle}>{props.subtitle}</Text>
        ) : null}
      </View>
      <View style={styles.sectionBody}>{props.children}</View>
    </View>
  );
}

function Tag(props: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{props.label}</Text>
    </View>
  );
}

function FactRow(props: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.factRow, props.last && styles.factRowLast]}>
      <Text style={styles.factLabel}>{props.label}</Text>
      <Text style={styles.factValue}>{props.value}</Text>
    </View>
  );
}

function LineRow(props: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.lineRow, props.last && styles.lineRowLast]}>
      <Text style={styles.lineLabel}>{props.label}</Text>
      <Text style={styles.lineValue} numberOfLines={1}>
        {props.value}
      </Text>
    </View>
  );
}

function AlternativeRow(props: {
  title: string;
  subtitle: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.altRow, props.last && styles.altRowLast]}>
      <Text style={styles.altTitle}>{props.title}</Text>
      <Text style={styles.altSubtitle}>{props.subtitle}</Text>
    </View>
  );
}

function SearchResultRow(props: {
  item: ProductSearchResult;
  onAdd: () => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.searchResultRow, props.last && styles.searchResultRowLast]}>
      {props.item.image.length > 0 ? (
        <Image source={{ uri: props.item.image }} style={styles.searchResultThumb} />
      ) : (
        <View style={[styles.searchResultThumb, styles.searchResultThumbFallback]}>
          <Text style={styles.searchResultThumbFallbackText}>SHOP</Text>
        </View>
      )}
      <View style={styles.searchResultTextBlock}>
        <Text style={styles.searchResultBrand}>
          {[props.item.brand, props.item.mallName].filter(Boolean).join(' · ') || '상품'}
        </Text>
        <Text style={styles.searchResultTitle} numberOfLines={2}>
          {props.item.title}
        </Text>
        <Text style={styles.searchResultMeta} numberOfLines={1}>
          {props.item.categories.join(' / ') || '카테고리 정보 없음'}
        </Text>
        <View style={styles.searchResultFooter}>
          <Text style={styles.searchResultPrice}>{props.item.priceLabel}</Text>
          <Pressable onPress={props.onAdd} style={styles.searchAddButton}>
            <Text style={styles.searchAddButtonText}>탭해서 추가</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PreferenceGroup(props: {
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.preferenceGroup, props.last && styles.preferenceGroupLast]}>
      <Text style={styles.preferenceGroupLabel}>{props.label}</Text>
      <View style={styles.preferenceOptions}>{props.children}</View>
    </View>
  );
}

function OptionChip(props: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.optionChip, props.active && styles.optionChipActive]}
    >
      <Text
        style={[styles.optionChipText, props.active && styles.optionChipTextActive]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

function ClosetItemRow(props: {
  item: ClosetItem;
  active: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        styles.catalogRow,
        props.active && styles.catalogRowActive,
        props.last && styles.catalogRowLast,
      ]}
    >
      <View style={styles.catalogRowHeader}>
        <Text style={styles.catalogName} numberOfLines={1}>
          {props.item.name}
        </Text>
        <Text style={styles.catalogRange}>
          {props.item.minTemp}° - {props.item.maxTemp}°
        </Text>
      </View>
      <Text style={styles.catalogRole} numberOfLines={2}>
        {props.item.role}
      </Text>
      {props.item.materials != null && props.item.materials.length > 0 ? (
        <Text style={styles.catalogMeta} numberOfLines={1}>
          {(props.item.source === 'name-analysis' ? '상품명 분석 · ' : '') +
            props.item.materials.join(' · ')}
        </Text>
      ) : null}
      <Text style={styles.catalogState}>
        {props.active ? '선택됨' : '탭해서 추가'}
      </Text>
    </Pressable>
  );
}

function LoadingCard() {
  return (
    <View style={styles.loadingCard}>
      <ActivityIndicator color={palette.white} />
      <Text style={styles.loadingText}>추천을 불러오는 중</Text>
    </View>
  );
}

function formatLocationLabel(
  placemark: Location.LocationGeocodedAddress | undefined,
) {
  if (!placemark) {
    return '현재 위치';
  }

  return (
    placemark.district ??
    placemark.city ??
    placemark.subregion ??
    placemark.region ??
    '현재 위치'
  );
}

function formatRegionLabel(
  placemark: Location.LocationGeocodedAddress | undefined,
) {
  if (!placemark) {
    return '현재 위치';
  }

  return placemark.city ?? placemark.region ?? '현재 위치';
}

function getMissingClosetSections(profile: ReturnType<typeof buildClosetProfile>) {
  return profile.categories
    .filter((category) =>
      ['tops', 'bottoms', 'shoes'].includes(category.key) && category.count === 0,
    )
    .map((category) => category.name);
}

function buildLeadCopy(weather: WeatherSnapshot) {
  if (weather.today.precipitationProbabilityMax >= 45) {
    return '비 예보를 고려해 젖어도 덜 불편한 쪽으로 골랐어요.';
  }

  if (weather.periods[0].apparentTemperature <= 10) {
    return '아침이 서늘해서 보온을 먼저 챙기는 쪽이 안전해요.';
  }

  if (weather.today.maxTemp - weather.today.minTemp >= 8) {
    return '일교차가 커서 벗고 입기 쉬운 조합이 맞아요.';
  }

  return '하루 종일 무난하게 입기 좋은 조합이에요.';
}

function buildSearchDerivedRole(
  result: ProductSearchResult,
  analysisSummary: string,
) {
  const sourceLine = [result.mallName, result.priceLabel].filter(Boolean).join(' · ');

  if (sourceLine.length === 0) {
    return `실제 상품 검색 결과 기준 ${analysisSummary}`;
  }

  return `${sourceLine} · ${analysisSummary}`;
}

function findExistingCatalogItemByName(
  catalog: Record<ClosetCategoryKey, ClosetItem[]>,
  name: string,
) {
  const normalizedName = name.trim().toLowerCase();

  for (const category of Object.keys(catalog) as ClosetCategoryKey[]) {
    const matchedItem = catalog[category].find(
      (item) => item.name.trim().toLowerCase() === normalizedName,
    );

    if (matchedItem != null) {
      return { category, item: matchedItem };
    }
  }

  return null;
}

function getWeatherSceneVariant(
  weather: WeatherSnapshot | null,
): WeatherSceneVariant {
  if (weather == null) {
    return 'partly-cloudy-day';
  }

  const weatherCode = weather.current.weatherCode;

  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return 'snowy-day';
  }

  if (
    [
      51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
    ].includes(weatherCode)
  ) {
    return 'rainy-day';
  }

  if (!weather.current.isDay) {
    return 'clear-night';
  }

  if ([3, 45, 48].includes(weatherCode)) {
    return 'cloudy-day';
  }

  if ([1, 2].includes(weatherCode)) {
    return 'partly-cloudy-day';
  }

  return 'clear-day';
}

const glassLine = 'rgba(255, 255, 255, 0.12)';
const glassLabel = 'rgba(244, 248, 255, 0.76)';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#5f86d6',
  },
  appText: {
    fontFamily: typography.regular,
    includeFontPadding: false,
  },
  safeArea: {
    flex: 1,
  },
  scene: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneImage: {
    resizeMode: 'cover',
  },
  sceneTopWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: 'rgba(123, 165, 225, 0.14)',
  },
  sceneShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(45, 84, 146, 0.24)',
  },
  sceneMistBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: 'rgba(27, 53, 100, 0.30)',
  },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 36,
    gap: 20,
  },
  header: {
    gap: 6,
  },
  headerDate: {
    color: 'rgba(241, 246, 255, 0.82)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  headerTitle: {
    color: palette.white,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '600',
  },
  headerMeta: {
    color: 'rgba(241, 246, 255, 0.82)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'flex-start',
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(31, 52, 95, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  tabText: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  tabTextActive: {
    color: palette.white,
  },
  tabIndicator: {
    display: 'none',
  },
  tabIndicatorShown: {
    display: 'none',
  },
  notice: {
    color: '#ffe5e8',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  stack: {
    gap: 22,
  },
  recommendationCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: 'rgba(62, 89, 145, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    gap: 18,
    ...shadows.card,
  },
  recommendationTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  recommendationMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tagText: {
    color: palette.white,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  temperatureText: {
    color: palette.white,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  recommendationTitle: {
    color: palette.white,
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '600',
  },
  recommendationLead: {
    color: 'rgba(245,248,255,0.92)',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  recommendationSummary: {
    color: 'rgba(240, 246, 255, 0.78)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  factList: {
    borderTopWidth: 1,
    borderTopColor: glassLine,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: glassLine,
    gap: 12,
  },
  factRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  factLabel: {
    color: glassLabel,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  factValue: {
    color: palette.white,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'right',
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  utilityButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(62, 89, 145, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  utilityButtonText: {
    color: palette.white,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  primaryActionButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 31, 58, 0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryActionButtonText: {
    color: palette.white,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    color: palette.white,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '600',
  },
  sectionSubtitle: {
    color: 'rgba(240, 246, 255, 0.72)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  sectionBody: {
    borderRadius: 22,
    backgroundColor: 'rgba(62, 89, 145, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
    ...shadows.card,
  },
  noteBlock: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 8,
  },
  noteLead: {
    color: palette.white,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  noteText: {
    color: glassLabel,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: glassLine,
    gap: 16,
  },
  lineRowLast: {
    borderBottomWidth: 0,
  },
  lineLabel: {
    color: glassLabel,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  lineValue: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    color: palette.white,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  altRow: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: glassLine,
    gap: 6,
  },
  altRowLast: {
    borderBottomWidth: 0,
  },
  altTitle: {
    color: palette.white,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  altSubtitle: {
    color: glassLabel,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  feedbackWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 18,
  },
  feedbackChip: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  feedbackChipActive: {
    backgroundColor: 'rgba(18, 31, 58, 0.30)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  feedbackChipText: {
    color: palette.white,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  feedbackChipTextActive: {
    color: palette.white,
  },
  closetCard: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: 'rgba(62, 89, 145, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    gap: 8,
    ...shadows.card,
  },
  closetCount: {
    color: palette.white,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  closetSummary: {
    color: 'rgba(245,248,255,0.90)',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  closetMeta: {
    color: 'rgba(240, 246, 255, 0.74)',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  productInputCard: {
    padding: 18,
    gap: 12,
  },
  productInput: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16,
    color: palette.white,
    fontFamily: typography.medium,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  productInputButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 27, 52, 0.36)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  productInputButtonDisabled: {
    opacity: 0.58,
  },
  productInputActions: {
    flexDirection: 'row',
    gap: 10,
  },
  productInputButtonText: {
    color: palette.white,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  productSecondaryButton: {
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productSecondaryButtonText: {
    color: palette.white,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  productInputWarning: {
    color: '#ffe5e8',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  searchResultList: {
    borderTopWidth: 1,
    borderTopColor: glassLine,
  },
  searchResultRow: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: glassLine,
  },
  searchResultRowLast: {
    borderBottomWidth: 0,
  },
  searchResultThumb: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  searchResultThumbFallback: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultThumbFallbackText: {
    color: palette.white,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  searchResultTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  searchResultBrand: {
    color: glassLabel,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  searchResultTitle: {
    color: palette.white,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  searchResultMeta: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  searchResultFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  searchResultPrice: {
    color: palette.white,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  searchAddButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(18, 31, 58, 0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  searchAddButtonText: {
    color: palette.white,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  preferenceGroup: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: glassLine,
    gap: 12,
  },
  preferenceGroupLast: {
    borderBottomWidth: 0,
  },
  preferenceGroupLabel: {
    color: glassLabel,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  preferenceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  optionChipActive: {
    backgroundColor: 'rgba(18, 31, 58, 0.30)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  optionChipText: {
    color: palette.white,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: palette.white,
  },
  categoryGroup: {
    paddingTop: 16,
    borderBottomWidth: 1,
    borderBottomColor: glassLine,
  },
  categoryGroupLast: {
    borderBottomWidth: 0,
  },
  categoryGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 10,
    gap: 12,
  },
  categoryGroupTitle: {
    color: palette.white,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  categoryGroupCount: {
    color: glassLabel,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  catalogRow: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: glassLine,
    gap: 6,
  },
  catalogRowActive: {
    backgroundColor: 'rgba(19, 34, 64, 0.22)',
  },
  catalogRowLast: {
    borderBottomWidth: 0,
  },
  catalogRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  catalogName: {
    flex: 1,
    minWidth: 0,
    color: palette.white,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  catalogRange: {
    color: glassLabel,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  catalogRole: {
    color: glassLabel,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  catalogMeta: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  catalogState: {
    color: palette.white,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  loadingCard: {
    alignItems: 'center',
    paddingVertical: 40,
    borderRadius: 22,
    backgroundColor: 'rgba(62, 89, 145, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    gap: 10,
  },
  loadingText: {
    color: palette.white,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
});
