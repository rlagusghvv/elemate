import {
  getCategoryLabel,
  type ClosetCategoryKey,
  type ClosetItem,
} from '../data/sample-data';

type AnalysisConfidence = 'high' | 'medium';

export type ProductNameAnalysis = {
  category: ClosetCategoryKey;
  confidence: AnalysisConfidence;
  item: ClosetItem;
  summary: string;
};

const categoryKeywords: Record<ClosetCategoryKey, string[]> = {
  tops: [
    '티셔츠',
    '반팔',
    '긴팔',
    '상의',
    '셔츠',
    '니트',
    '스웨터',
    '맨투맨',
    '후드',
    '후디',
    'tee',
    'shirt',
    'knit',
    'sweater',
    'hoodie',
    'sweatshirt',
  ],
  outerwear: [
    '아우터',
    '가디건',
    '블레이저',
    '자켓',
    '재킷',
    '코트',
    '트렌치',
    '바람막이',
    '점퍼',
    '패딩',
    '아노락',
    'cardigan',
    'blazer',
    'jacket',
    'coat',
    'trench',
    'windbreaker',
    'shell',
    'parka',
    'down',
  ],
  bottoms: [
    '하의',
    '바지',
    '팬츠',
    '슬랙스',
    '트라우저',
    '데님',
    '진',
    '청바지',
    '나일론 팬츠',
    '쇼츠',
    '반바지',
    '치노',
    'pants',
    'slacks',
    'trousers',
    'denim',
    'jeans',
    'shorts',
    'chino',
  ],
  shoes: [
    '신발',
    '스니커즈',
    '로퍼',
    '더비',
    '부츠',
    '구두',
    '러너',
    '운동화',
    '샌들',
    'mule',
    'sneakers',
    'loafer',
    'derby',
    'boots',
    'shoes',
    'runner',
    'sandals',
  ],
};

const materialKeywords: Array<{ label: string; keys: string[] }> = [
  { label: '메리노 울', keys: ['메리노', 'merino'] },
  { label: '울', keys: ['울', 'wool'] },
  { label: '캐시미어', keys: ['캐시미어', 'cashmere'] },
  { label: '코튼', keys: ['코튼', '면', 'cotton'] },
  { label: '린넨', keys: ['린넨', 'linen'] },
  { label: '나일론', keys: ['나일론', 'nylon'] },
  { label: '데님', keys: ['데님', 'denim'] },
  { label: '레더', keys: ['레더', '가죽', 'leather'] },
  { label: '플리스', keys: ['플리스', 'fleece'] },
  { label: '폴리에스터', keys: ['폴리', 'poly', 'polyester'] },
];

export function analyzeProductName(
  rawName: string,
): ProductNameAnalysis | null {
  const name = rawName.trim();

  if (name.length < 2) {
    return null;
  }

  const normalized = name.toLowerCase();
  const categoryResult = inferCategory(normalized);
  const materials = inferMaterials(normalized);
  const tempRange = inferTemperatureRange(categoryResult.category, normalized, materials);
  const materialLabel = materials.length > 0 ? materials.join(' · ') : '소재 추정 없음';
  const warmthLabel =
    tempRange.maxTemp <= 15
      ? '서늘한 날용'
      : tempRange.minTemp >= 18
        ? '따뜻한 날용'
        : '간절기 중심';

  const role = `${materialLabel} 기준 ${warmthLabel}으로 분석한 ${getCategoryLabel(
    categoryResult.category,
  )}`;
  const summary = `${getCategoryLabel(categoryResult.category)} · ${tempRange.minTemp}°-${tempRange.maxTemp}° · ${materialLabel}`;

  return {
    category: categoryResult.category,
    confidence: categoryResult.confidence,
    summary,
    item: {
      id: buildItemId(name),
      name,
      minTemp: tempRange.minTemp,
      maxTemp: tempRange.maxTemp,
      role,
      materials,
      source: 'name-analysis',
    },
  };
}

function inferCategory(normalizedName: string) {
  const scores = Object.entries(categoryKeywords).map(([category, keywords]) => ({
    category: category as ClosetCategoryKey,
    score: keywords.reduce(
      (count, keyword) => count + (normalizedName.includes(keyword) ? 1 : 0),
      0,
    ),
  }));
  const best = scores.sort((left, right) => right.score - left.score)[0];

  return {
    category: best.score > 0 ? best.category : ('tops' as const),
    confidence: best.score >= 2 ? ('high' as const) : ('medium' as const),
  };
}

function inferMaterials(normalizedName: string) {
  return materialKeywords
    .filter((entry) => entry.keys.some((key) => normalizedName.includes(key)))
    .map((entry) => entry.label)
    .slice(0, 3);
}

function inferTemperatureRange(
  category: ClosetCategoryKey,
  normalizedName: string,
  materials: string[],
) {
  const base = getBaseTemperatureRange(category, normalizedName);
  const adjusted = applyMaterialAdjustment(base, materials, category);

  return {
    minTemp: clampTemperature(adjusted.minTemp),
    maxTemp: clampTemperature(Math.max(adjusted.maxTemp, adjusted.minTemp + 5)),
  };
}

function getBaseTemperatureRange(
  category: ClosetCategoryKey,
  normalizedName: string,
) {
  switch (category) {
    case 'outerwear':
      if (hasAny(normalizedName, ['패딩', '다운', 'padding', 'down'])) {
        return { minTemp: -8, maxTemp: 6 };
      }

      if (hasAny(normalizedName, ['코트', 'coat', '트렌치', 'trench'])) {
        return { minTemp: 3, maxTemp: 14 };
      }

      if (hasAny(normalizedName, ['가디건', 'cardigan'])) {
        return { minTemp: 11, maxTemp: 20 };
      }

      if (hasAny(normalizedName, ['바람막이', 'shell', 'windbreaker'])) {
        return { minTemp: 8, maxTemp: 19 };
      }

      return { minTemp: 10, maxTemp: 20 };

    case 'bottoms':
      if (hasAny(normalizedName, ['쇼츠', '반바지', 'shorts'])) {
        return { minTemp: 22, maxTemp: 34 };
      }

      if (hasAny(normalizedName, ['데님', 'denim', 'jeans', '청바지'])) {
        return { minTemp: 5, maxTemp: 19 };
      }

      if (hasAny(normalizedName, ['나일론', 'nylon'])) {
        return { minTemp: 18, maxTemp: 30 };
      }

      return { minTemp: 10, maxTemp: 24 };

    case 'shoes':
      if (hasAny(normalizedName, ['부츠', 'boots'])) {
        return { minTemp: 4, maxTemp: 18 };
      }

      if (hasAny(normalizedName, ['샌들', 'sandals'])) {
        return { minTemp: 22, maxTemp: 34 };
      }

      if (hasAny(normalizedName, ['로퍼', '더비', 'loafer', 'derby'])) {
        return { minTemp: 12, maxTemp: 24 };
      }

      return { minTemp: 9, maxTemp: 27 };

    case 'tops':
      if (hasAny(normalizedName, ['반팔', 'short sleeve', 'tee'])) {
        return { minTemp: 20, maxTemp: 32 };
      }

      if (hasAny(normalizedName, ['긴팔', 'long sleeve'])) {
        return { minTemp: 15, maxTemp: 24 };
      }

      if (hasAny(normalizedName, ['셔츠', 'shirt'])) {
        return { minTemp: 12, maxTemp: 24 };
      }

      if (hasAny(normalizedName, ['니트', '스웨터', 'knit', 'sweater'])) {
        return { minTemp: 6, maxTemp: 17 };
      }

      if (hasAny(normalizedName, ['맨투맨', '후드', 'hoodie', 'sweatshirt'])) {
        return { minTemp: 9, maxTemp: 19 };
      }

      return { minTemp: 14, maxTemp: 24 };
  }
}

function applyMaterialAdjustment(
  range: { minTemp: number; maxTemp: number },
  materials: string[],
  category: ClosetCategoryKey,
) {
  let next = { ...range };

  materials.forEach((material) => {
    if (material === '메리노 울') {
      next = { minTemp: next.minTemp - 4, maxTemp: next.maxTemp - 3 };
      return;
    }

    if (material === '울' || material === '캐시미어' || material === '플리스') {
      next = { minTemp: next.minTemp - 3, maxTemp: next.maxTemp - 2 };
      return;
    }

    if (material === '린넨') {
      next = { minTemp: next.minTemp + 3, maxTemp: next.maxTemp + 4 };
      return;
    }

    if (material === '나일론' && category !== 'shoes') {
      next = { minTemp: next.minTemp + 1, maxTemp: next.maxTemp + 2 };
      return;
    }

    if (material === '레더' && category === 'shoes') {
      next = { minTemp: next.minTemp - 1, maxTemp: next.maxTemp - 1 };
    }
  });

  return next;
}

function clampTemperature(value: number) {
  return Math.min(34, Math.max(-12, Math.round(value)));
}

function buildItemId(name: string) {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return `user-${stem}-${Date.now().toString(36).slice(-6)}`;
}

function hasAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}
