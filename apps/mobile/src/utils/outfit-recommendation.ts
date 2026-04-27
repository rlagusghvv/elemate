import {
  type ClosetItem,
  type ClosetProfile,
  type FeedbackKey,
} from '../data/sample-data';
import type { WeatherSnapshot } from '../services/open-meteo';

export type OutfitRecommendation = {
  headline: string;
  summaryLine: string;
  items: Array<{ slot: string; name: string }>;
  alternatives: Array<{
    title: string;
    subtitle: string;
    items: Array<{ slot: string; name: string }>;
  }>;
  reasons: string[];
  commuteNote: string;
};

const feedbackOffsets: Record<FeedbackKey, number> = {
  perfect: 0,
  chilly: -2,
  warm: 2,
};

export function buildOutfitRecommendation(
  weather: WeatherSnapshot,
  feedback: FeedbackKey,
  closetProfile: ClosetProfile,
): OutfitRecommendation | null {
  const { tops, outerwear, bottoms, shoes } = closetProfile.inventory;

  if (tops.length === 0 || bottoms.length === 0 || shoes.length === 0) {
    return null;
  }

  const morning = weather.periods[0];
  const lunchtime = weather.periods[1];
  const preferences = buildPreferenceSignals(closetProfile);
  const comfortAdjustment =
    closetProfile.preference.temperatureOffset +
    closetProfile.preference.commuteOffset +
    feedbackOffsets[feedback];
  const effectiveMorningTemp =
    morning.apparentTemperature * 0.45 +
    weather.current.apparentTemperature * 0.35 +
    lunchtime.temperature * 0.2 +
    comfortAdjustment;
  const outerwearDecisionTemp =
    morning.apparentTemperature * 0.25 +
    weather.current.temperature * 0.35 +
    weather.today.maxTemp * 0.4 +
    comfortAdjustment;
  const dayGap = weather.today.maxTemp - weather.today.minTemp;
  const rainRisk = weather.today.precipitationProbabilityMax;
  const windRisk = Math.max(weather.current.windSpeed, weather.today.windSpeedMax);
  const warmLater =
    weather.current.temperature >= 17 ||
    lunchtime.temperature >= 21 ||
    weather.today.maxTemp >= 22;
  const topCandidates = filterTopItems(tops, weather);

  const top = pickBestItem(topCandidates, effectiveMorningTemp + (warmLater ? 1.5 : 0), {
    preferredKeywords: mergeKeywords(
      preferences.topKeywords,
      warmLater ? ['셔츠', '긴팔'] : [],
    ),
  });

  if (top == null) {
    return null;
  }

  const outerwearCandidates = filterOuterwearItems(outerwear, weather);
  const needsOuter =
    rainRisk >= 45 ||
    windRisk >= 20 ||
    outerwearDecisionTemp <= 13 ||
    ((outerwearDecisionTemp <= 16 || morning.apparentTemperature <= 9) &&
      (dayGap >= (preferences.prefersLayers ? 7 : 9) ||
        closetProfile.preference.commuteOffset < 0 ||
        windRisk >= 16)) ||
    (weather.current.temperature < 16 && dayGap >= 10) ||
    closetProfile.preference.commuteOffset < 0;
  const outer = needsOuter
    ? pickBestItem(outerwearCandidates, outerwearDecisionTemp + (warmLater ? 2.5 : 0), {
        preferredKeywords:
          rainRisk >= 45
            ? ['바람막이']
            : mergeKeywords(
                preferences.outerKeywords,
                warmLater ? ['가디건', '바람막이', '블레이저'] : [],
              ),
      })
    : null;
  const bottom =
    rainRisk >= 45
      ? pickBestItem(bottoms, morning.temperature, {
          preferredKeywords: ['데님', '나일론'],
        })
      : pickBestItem(bottoms, lunchtime.temperature, {
          preferredKeywords: preferences.bottomKeywords,
        });
  const shoe =
    rainRisk >= 45 || preferences.prefersRainReadyItems
      ? pickBestItem(shoes, morning.temperature, {
          preferredKeywords: ['발수'],
        })
      : pickBestItem(shoes, weather.today.maxTemp >= 23 ? 24 : 16, {
          preferredKeywords: preferences.shoeKeywords,
        });

  if (bottom == null || shoe == null) {
    return null;
  }

  const reasons = [
    morning.apparentTemperature <= 10 ? '아침 체감이 낮아요' : null,
    dayGap >= 8 ? '일교차가 커요' : null,
    rainRisk >= 45 ? '비 대비가 필요해요' : null,
    windRisk >= 18 ? '바람이 있어요' : null,
    warmLater ? '낮엔 더 가벼워져요' : null,
    closetProfile.preference.commuteOffset < 0 ? '이동 시간이 긴 편이에요' : null,
  ].filter((reason): reason is string => Boolean(reason));

  const items = [
    { slot: '상의', name: top.name },
    outer ? { slot: '아우터', name: outer.name } : null,
    { slot: '하의', name: bottom.name },
    { slot: '신발', name: shoe.name },
  ].filter(
    (
      item,
    ): item is {
      slot: string;
      name: string;
    } => Boolean(item),
  );

  return {
    headline: outer ? `${top.name} + ${outer.name}` : top.name,
    summaryLine: `체감 ${Math.round(
      morning.apparentTemperature,
    )}° · 최고 ${Math.round(
      weather.today.maxTemp,
    )}° · 비 ${Math.round(rainRisk)}%`,
    items,
    alternatives: buildAlternativeLooks({
      closetProfile,
      effectiveMorningTemp,
      lunchtimeTemp: lunchtime.temperature,
      rainRisk,
      current: { top, outer, bottom, shoe },
      preferences,
    }),
    reasons:
      reasons.length > 0 ? reasons.slice(0, 3) : ['무난한 날씨예요'],
    commuteNote: buildCommuteNote({
      closetProfile,
      rainRisk,
      dayGap,
    }),
  };
}

export function formatWeatherLabel(weatherCode: number, isDay = true) {
  if (weatherCode === 0) {
    return isDay ? '맑음' : '맑은 밤';
  }

  if ([1, 2].includes(weatherCode)) {
    return '구름 조금';
  }

  if (weatherCode === 3) {
    return '흐림';
  }

  if ([45, 48].includes(weatherCode)) {
    return '안개';
  }

  if ([51, 53, 55, 56, 57].includes(weatherCode)) {
    return '이슬비';
  }

  if ([61, 63, 65, 66, 67].includes(weatherCode)) {
    return '비';
  }

  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    return '눈';
  }

  if ([80, 81, 82].includes(weatherCode)) {
    return '소나기';
  }

  if ([95, 96, 99].includes(weatherCode)) {
    return '뇌우';
  }

  return '변동 있음';
}

export function describeWindStrength(windSpeed: number) {
  if (windSpeed >= 25) {
    return '꽤 강한 편';
  }

  if (windSpeed >= 18) {
    return '조금 강한 편';
  }

  if (windSpeed >= 10) {
    return '보통';
  }

  return '약한 편';
}

function buildAlternativeLooks(input: {
  closetProfile: ClosetProfile;
  effectiveMorningTemp: number;
  lunchtimeTemp: number;
  rainRisk: number;
  current: {
    top: ClosetItem;
    outer: ClosetItem | null;
    bottom: ClosetItem;
    shoe: ClosetItem;
  };
  preferences: PreferenceSignals;
}) {
  const alternateTop =
    pickBestItem(
      input.closetProfile.inventory.tops.filter(
        (item) => item.id !== input.current.top.id,
      ),
      input.lunchtimeTemp,
      { preferredKeywords: input.preferences.topKeywords },
    ) ?? input.current.top;
  const alternateOuter = input.current.outer
    ? pickBestItem(
        input.closetProfile.inventory.outerwear.filter(
          (item) => item.id !== input.current.outer?.id,
        ),
        input.effectiveMorningTemp + 1,
        { preferredKeywords: input.preferences.outerKeywords },
      ) ?? input.current.outer
    : pickBestItem(
        input.closetProfile.inventory.outerwear,
        input.effectiveMorningTemp,
        { preferredKeywords: input.preferences.outerKeywords },
      );
  const alternateBottom =
    pickBestItem(
      input.closetProfile.inventory.bottoms.filter(
        (item) => item.id !== input.current.bottom.id,
      ),
      input.lunchtimeTemp - 1,
      { preferredKeywords: input.preferences.bottomKeywords },
    ) ?? input.current.bottom;
  const alternateShoe =
    pickBestItem(
      input.closetProfile.inventory.shoes.filter(
        (item) => item.id !== input.current.shoe.id,
      ),
      input.lunchtimeTemp,
      {
        preferredKeywords:
          input.rainRisk >= 45 ? ['발수'] : input.preferences.shoeKeywords,
      },
    ) ?? input.current.shoe;

  return [
    {
      title: alternateOuter
        ? `${input.current.top.name} + ${alternateOuter.name}`
        : `${alternateTop.name} 중심으로 가볍게`,
      subtitle:
        input.current.outer != null
          ? '실내 이동이 많으면 아우터만 바꿔도 충분해요'
          : '낮 기온을 더 반영한 대안 조합이에요',
      items: [
        { slot: '상의', name: input.current.top.name },
        alternateOuter ? { slot: '아우터', name: alternateOuter.name } : null,
        { slot: '하의', name: input.current.bottom.name },
        { slot: '신발', name: input.current.shoe.name },
      ].filter(isOutfitItem),
    },
    {
      title: `${alternateTop.name} + ${alternateBottom.name}`,
      subtitle:
        input.rainRisk >= 45
          ? '비를 고려해 발은 가볍고 안정적으로 가져가요'
          : '조금 더 다른 무드로 바꾼 대안 조합이에요',
      items: [
        { slot: '상의', name: alternateTop.name },
        input.current.outer ? { slot: '아우터', name: input.current.outer.name } : null,
        { slot: '하의', name: alternateBottom.name },
        { slot: '신발', name: alternateShoe.name },
      ].filter(isOutfitItem),
    },
  ];
}

function buildCommuteNote(input: {
  closetProfile: ClosetProfile;
  rainRisk: number;
  dayGap: number;
}) {
  if (input.rainRisk >= 45) {
    return `비 예보가 있어서 ${input.closetProfile.preference.commuteMode} 기준으로도 신발은 발수 위주가 안전해요.`;
  }

  if (input.closetProfile.preference.commuteOffset < 0) {
    return '걷는 시간이 긴 편이라 바람을 막는 겹옷 하나를 남겨두는 편이 좋아요.';
  }

  if (input.dayGap >= 8) {
    return '점심엔 아우터를 벗고, 퇴근길에는 다시 걸칠 수 있게 가벼운 겹옷 구성이 좋습니다.';
  }

  return '온도 변화가 크지 않아 실내외 이동이 많아도 크게 불편하지 않은 조합입니다.';
}

function buildPreferenceSignals(closetProfile: ClosetProfile) {
  const tags = closetProfile.preference.tags;

  return {
    prefersLayers: tags.includes('레이어드 가능'),
    prefersRainReadyItems: tags.includes('비 오는 날 대비'),
    topKeywords: tags.includes('셔츠 자주 입음')
      ? ['셔츠', '니트']
      : tags.includes('포멀 선호')
        ? ['셔츠', '니트']
        : ['티셔츠', '스웨트'],
    outerKeywords: tags.includes('포멀 선호')
      ? ['블레이저', '코트']
      : tags.includes('레이어드 가능')
        ? ['가디건', '바람막이']
        : ['바람막이'],
    bottomKeywords: tags.includes('포멀 선호')
      ? ['슬랙스', '코튼']
      : ['코튼', '데님', '나일론'],
    shoeKeywords: tags.includes('포멀 선호')
      ? ['로퍼', '더비']
      : ['스니커즈', '로퍼'],
  };
}

type PreferenceSignals = ReturnType<typeof buildPreferenceSignals>;

function filterTopItems(items: ClosetItem[], weather: WeatherSnapshot) {
  const shouldLightenTop =
    weather.current.temperature >= 17 ||
    weather.periods[1].temperature >= 21 ||
    weather.today.maxTemp >= 22;
  const filtered = items.filter((item) => !shouldLightenTop || !isHeavyTop(item));

  return filtered.length > 0 ? filtered : items;
}

function filterOuterwearItems(items: ClosetItem[], weather: WeatherSnapshot) {
  const shouldBlockHeavyOuterwear =
    weather.current.temperature >= 17 ||
    weather.periods[1].temperature >= 20 ||
    weather.today.maxTemp >= 22;
  const filtered = items.filter(
    (item) => !shouldBlockHeavyOuterwear || !isHeavyOuterwear(item),
  );

  return filtered.length > 0 ? filtered : items;
}

function pickBestItem(
  items: ClosetItem[],
  targetTemp: number,
  options: {
    preferredKeywords?: string[];
  } = {},
) {
  if (items.length === 0) {
    return null;
  }

  return items.reduce((best, item) => {
    const bestScore = scoreItem(best, targetTemp, options.preferredKeywords);
    const nextScore = scoreItem(item, targetTemp, options.preferredKeywords);

    return nextScore < bestScore ? item : best;
  }, items[0]);
}

function scoreItem(
  item: ClosetItem,
  targetTemp: number,
  preferredKeywords: string[] = [],
) {
  const comfortDistance = distanceFromComfortRange(item, targetTemp);
  const keywordBonus = preferredKeywords.some((keyword) =>
    item.name.includes(keyword),
  )
    ? -1.2
    : 0;

  return comfortDistance + keywordBonus;
}

function distanceFromComfortRange(item: ClosetItem, targetTemp: number) {
  const center = (item.minTemp + item.maxTemp) / 2;
  const distanceFromCenter = Math.abs(center - targetTemp);
  const outsidePenalty =
    targetTemp < item.minTemp
      ? item.minTemp - targetTemp
      : targetTemp > item.maxTemp
        ? targetTemp - item.maxTemp
        : 0;

  return distanceFromCenter + outsidePenalty * 3;
}

function isHeavyTop(item: ClosetItem) {
  return item.maxTemp <= 15 || item.name.includes('니트');
}

function isHeavyOuterwear(item: ClosetItem) {
  return item.maxTemp <= 12 || item.name.includes('코트');
}

function mergeKeywords(...groups: string[][]) {
  return Array.from(new Set(groups.flat()));
}

function isOutfitItem(
  item:
    | {
        slot: string;
        name: string;
      }
    | null,
): item is {
  slot: string;
  name: string;
} {
  return item != null;
}
