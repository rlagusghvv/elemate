import type { ClosetCategoryKey } from './sample-data';

export type CatalogTrigger = 'cold' | 'swing' | 'rain' | 'mild';
export type CatalogLayerWeight = 'light' | 'mid' | 'heavy';
export type CatalogMood =
  | 'minimal'
  | 'formal'
  | 'commuter'
  | 'functional'
  | 'sporty';
export type CatalogSourceChannel = 'resale-market' | 'luxury-retail' | 'editorial';

export type CatalogSuggestion = {
  id: string;
  brand: string;
  name: string;
  priceLabel: string;
  badge: string;
  reason: string;
  category: ClosetCategoryKey;
  sourceLabel: string;
  imageUrl: string;
  productUrl: string;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  display: {
    brand: string;
    name: string;
    badge: string;
    priceLabel: string;
  };
  media: {
    imageUrl: string;
    productUrl: string;
  };
  pricing: {
    amountKrw: number;
    currency: 'KRW';
  };
  taxonomy: {
    category: ClosetCategoryKey;
    subcategory: string;
    color: string;
    materials: string[];
    moods: CatalogMood[];
    keywords: string[];
  };
  weatherProfile: {
    minTemp: number;
    maxTemp: number;
    layerWeight: CatalogLayerWeight;
    waterproof: boolean;
    windResistant: boolean;
  };
  source: {
    merchant: string;
    channel: CatalogSourceChannel;
    externalId: string;
    ingestedAt: string;
  };
  recommendation: {
    triggers: CatalogTrigger[];
    reason: string;
  };
};

export type CatalogDatabase = {
  version: 1;
  updatedAt: string;
  products: CatalogProduct[];
};

export type CatalogQuery = {
  triggers: CatalogTrigger[];
  targetTemp: number;
  maxTemp: number;
  rainRisk: number;
  categories?: ClosetCategoryKey[];
  limit?: number;
};

export type ResaleMarketFeedRecord = {
  productId: string;
  styleCode: string;
  brandName: string;
  productName: string;
  category: ClosetCategoryKey;
  colorway?: string;
  marketPriceKrw: number;
  materials?: string[];
  features?: string[];
};

export type LuxuryRetailFeedRecord = {
  itemId: string;
  brand: string;
  title: string;
  category: ClosetCategoryKey;
  subcategory: string;
  color: string;
  priceKrw: number;
  materials?: string[];
  attributes?: string[];
};

type CatalogSeedInput = {
  merchant: string;
  channel: CatalogSourceChannel;
  externalId: string;
  brand: string;
  name: string;
  category: ClosetCategoryKey;
  subcategory: string;
  color: string;
  materials: string[];
  keywords: string[];
  priceKrw: number;
  ingestedAt: string;
};

const seedTimestamp = '2026-04-24T07:00:00.000Z';

const resaleMarketSeed: ResaleMarketFeedRecord[] = [
  {
    productId: 'RM-10012',
    styleCode: 'CS-SHELL-01',
    brandName: 'City Standard',
    productName: 'Packable Shell Jacket',
    category: 'outerwear',
    colorway: 'Slate Blue',
    marketPriceKrw: 89000,
    materials: ['Nylon'],
    features: ['Packable', 'Wind Resistant', 'Water Repellent'],
  },
  {
    productId: 'RM-10053',
    styleCode: 'OM-CARDI-08',
    brandName: 'Ordinary Monday',
    productName: 'Washable Cotton Cardigan',
    category: 'outerwear',
    colorway: 'Heather Grey',
    marketPriceKrw: 64000,
    materials: ['Cotton'],
    features: ['Light Layer', 'Office Friendly'],
  },
  {
    productId: 'RM-10118',
    styleCode: 'FM-RUNNER-04',
    brandName: 'Field Move',
    productName: 'Waterproof Runner',
    category: 'shoes',
    colorway: 'Graphite',
    marketPriceKrw: 118000,
    materials: ['Mesh', 'Rubber'],
    features: ['Waterproof', 'Commute', 'Grip'],
  },
  {
    productId: 'RM-10177',
    styleCode: 'CD-TEE-03',
    brandName: 'Common Draft',
    productName: 'Airy Long Sleeve Tee',
    category: 'tops',
    colorway: 'Soft White',
    marketPriceKrw: 42000,
    materials: ['Cotton Jersey'],
    features: ['Lightweight', 'Layer Base'],
  },
  {
    productId: 'RM-10211',
    styleCode: 'CF-PANT-05',
    brandName: 'Common Form',
    productName: 'Tech Nylon Easy Pants',
    category: 'bottoms',
    colorway: 'Deep Olive',
    marketPriceKrw: 76000,
    materials: ['Nylon'],
    features: ['Quick Dry', 'Rain Ready'],
  },
];

const luxuryRetailSeed: LuxuryRetailFeedRecord[] = [
  {
    itemId: 'LR-20331',
    brand: 'Attic Grey',
    title: 'Oxford Stripe Shirt',
    category: 'tops',
    subcategory: 'shirt',
    color: 'Blue Stripe',
    priceKrw: 72000,
    materials: ['Cotton'],
    attributes: ['Formal', 'Office', 'Breathable'],
  },
  {
    itemId: 'LR-20389',
    brand: 'Structure Dept.',
    title: 'Fine Merino Crewneck',
    category: 'tops',
    subcategory: 'knit',
    color: 'Stone',
    priceKrw: 112000,
    materials: ['Merino Wool'],
    attributes: ['Warm', 'Soft Handfeel'],
  },
  {
    itemId: 'LR-20410',
    brand: 'Line Atelier',
    title: 'Travel Mac Coat',
    category: 'outerwear',
    subcategory: 'coat',
    color: 'Taupe',
    priceKrw: 198000,
    materials: ['Cotton Blend'],
    attributes: ['Wind Resistant', 'Smart Casual'],
  },
  {
    itemId: 'LR-20455',
    brand: 'Chapter Nine',
    title: 'Soft Leather Loafer',
    category: 'shoes',
    subcategory: 'loafer',
    color: 'Black',
    priceKrw: 139000,
    materials: ['Leather'],
    attributes: ['Formal', 'Office'],
  },
  {
    itemId: 'LR-20502',
    brand: 'Frame Office',
    title: 'Tapered Cotton Trousers',
    category: 'bottoms',
    subcategory: 'trousers',
    color: 'Warm Sand',
    priceKrw: 98000,
    materials: ['Cotton Twill'],
    attributes: ['Minimal', 'Commuter'],
  },
];

export const catalogDatabase = buildCatalogDatabase({
  resaleFeed: resaleMarketSeed,
  luxuryFeed: luxuryRetailSeed,
});

export function buildCatalogDatabase(input: {
  resaleFeed: ResaleMarketFeedRecord[];
  luxuryFeed: LuxuryRetailFeedRecord[];
}): CatalogDatabase {
  const products = [
    ...parseResaleMarketFeed(input.resaleFeed),
    ...parseLuxuryRetailFeed(input.luxuryFeed),
  ];

  return {
    version: 1,
    updatedAt: seedTimestamp,
    products,
  };
}

export function parseResaleMarketFeed(records: ResaleMarketFeedRecord[]) {
  return records.map((record) =>
    normalizeCatalogProduct({
      merchant: 'Resale Select',
      channel: 'resale-market',
      externalId: record.productId,
      brand: record.brandName,
      name: record.productName,
      category: record.category,
      subcategory: inferSubcategory(record.productName, record.category),
      color: record.colorway ?? 'Unknown',
      materials: record.materials ?? [],
      keywords: [record.styleCode, ...(record.features ?? [])],
      priceKrw: record.marketPriceKrw,
      ingestedAt: seedTimestamp,
    }),
  );
}

export function parseLuxuryRetailFeed(records: LuxuryRetailFeedRecord[]) {
  return records.map((record) =>
    normalizeCatalogProduct({
      merchant: 'Luxury Edit',
      channel: 'luxury-retail',
      externalId: record.itemId,
      brand: record.brand,
      name: record.title,
      category: record.category,
      subcategory: record.subcategory,
      color: record.color,
      materials: record.materials ?? [],
      keywords: record.attributes ?? [],
      priceKrw: record.priceKrw,
      ingestedAt: seedTimestamp,
    }),
  );
}

export function queryCatalogSuggestions(
  database: CatalogDatabase,
  query: CatalogQuery,
): CatalogSuggestion[] {
  const limit = query.limit ?? 3;

  return database.products
    .filter((product) =>
      query.categories == null
        ? true
        : query.categories.includes(product.taxonomy.category),
    )
    .filter((product) =>
      query.triggers.some((trigger) =>
        product.recommendation.triggers.includes(trigger),
      ),
    )
    .sort((left, right) => {
      const leftScore = scoreCatalogProduct(left, query);
      const rightScore = scoreCatalogProduct(right, query);

      return leftScore - rightScore;
    })
    .slice(0, limit)
    .map((product) => ({
      id: product.id,
      brand: product.display.brand,
      name: product.display.name,
      priceLabel: product.display.priceLabel,
      badge: product.display.badge,
      reason: product.recommendation.reason,
      category: product.taxonomy.category,
      sourceLabel:
        product.source.channel === 'resale-market'
          ? '리셀 카탈로그'
          : product.source.channel === 'luxury-retail'
            ? '리테일 카탈로그'
            : '에디토리얼 카탈로그',
      imageUrl: product.media.imageUrl,
      productUrl: product.media.productUrl,
    }));
}

function normalizeCatalogProduct(input: CatalogSeedInput): CatalogProduct {
  const traits = inferCatalogTraits({
    category: input.category,
    name: input.name,
    materials: input.materials,
    keywords: input.keywords,
  });
  const slug = buildSlug(input.brand, input.name, input.externalId);

  return {
    id: slug,
    slug,
    display: {
      brand: input.brand,
      name: input.name,
      badge: buildBadge(traits, input.category),
      priceLabel: formatPriceLabel(input.priceKrw),
    },
    media: {
      imageUrl: buildThumbnailUrl({
        brand: input.brand,
        name: input.name,
        category: input.category,
      }),
      productUrl: buildSearchUrl(`${input.brand} ${input.name}`),
    },
    pricing: {
      amountKrw: input.priceKrw,
      currency: 'KRW',
    },
    taxonomy: {
      category: input.category,
      subcategory: input.subcategory,
      color: input.color,
      materials: input.materials,
      moods: traits.moods,
      keywords: input.keywords,
    },
    weatherProfile: {
      minTemp: traits.minTemp,
      maxTemp: traits.maxTemp,
      layerWeight: traits.layerWeight,
      waterproof: traits.waterproof,
      windResistant: traits.windResistant,
    },
    source: {
      merchant: input.merchant,
      channel: input.channel,
      externalId: input.externalId,
      ingestedAt: input.ingestedAt,
    },
    recommendation: {
      triggers: traits.triggers,
      reason: buildReason(traits, input.category),
    },
  };
}

function scoreCatalogProduct(product: CatalogProduct, query: CatalogQuery) {
  const center =
    (product.weatherProfile.minTemp + product.weatherProfile.maxTemp) / 2;
  const comfortDistance = Math.abs(center - query.targetTemp);
  const triggerPenalty = query.triggers.includes(product.recommendation.triggers[0])
    ? 0
    : 1.5;
  const rainPenalty =
    query.rainRisk >= 45 &&
    ['outerwear', 'shoes'].includes(product.taxonomy.category) &&
    !product.weatherProfile.waterproof
      ? 3
      : 0;
  const warmPenalty =
    query.maxTemp >= 22 && product.weatherProfile.layerWeight === 'heavy' ? 5 : 0;

  return comfortDistance + triggerPenalty + rainPenalty + warmPenalty;
}

function inferCatalogTraits(input: {
  category: ClosetCategoryKey;
  name: string;
  materials: string[];
  keywords: string[];
}) {
  const tokenSource = [
    input.name,
    ...input.materials,
    ...input.keywords,
    input.category,
  ].join(' ');
  const text = tokenSource.toLowerCase();

  switch (input.category) {
    case 'outerwear':
      if (hasAny(text, ['coat', 'wool', 'parka'])) {
        return {
          minTemp: 1,
          maxTemp: 14,
          layerWeight: 'heavy' as const,
          waterproof: false,
          windResistant: true,
          moods: ['formal', 'commuter'] as CatalogMood[],
          triggers: ['cold', 'swing'] as CatalogTrigger[],
        };
      }

      if (hasAny(text, ['shell', 'wind', 'repellent', 'rain'])) {
        return {
          minTemp: 10,
          maxTemp: 21,
          layerWeight: 'light' as const,
          waterproof: hasAny(text, ['waterproof', 'repellent']),
          windResistant: true,
          moods: ['functional', 'commuter'] as CatalogMood[],
          triggers: ['rain', 'swing'] as CatalogTrigger[],
        };
      }

      return {
        minTemp: 11,
        maxTemp: 20,
        layerWeight: 'mid' as const,
        waterproof: false,
        windResistant: false,
        moods: ['minimal', 'commuter'] as CatalogMood[],
        triggers: ['cold', 'swing'] as CatalogTrigger[],
      };

    case 'tops':
      if (hasAny(text, ['merino', 'knit', 'sweater'])) {
        return {
          minTemp: 5,
          maxTemp: 16,
          layerWeight: 'mid' as const,
          waterproof: false,
          windResistant: false,
          moods: ['minimal', 'formal'] as CatalogMood[],
          triggers: ['cold'] as CatalogTrigger[],
        };
      }

      if (hasAny(text, ['shirt', 'oxford'])) {
        return {
          minTemp: 12,
          maxTemp: 24,
          layerWeight: 'light' as const,
          waterproof: false,
          windResistant: false,
          moods: ['formal', 'commuter'] as CatalogMood[],
          triggers: ['mild', 'swing'] as CatalogTrigger[],
        };
      }

      return {
        minTemp: 17,
        maxTemp: 28,
        layerWeight: 'light' as const,
        waterproof: false,
        windResistant: false,
        moods: ['minimal', 'sporty'] as CatalogMood[],
        triggers: ['mild'] as CatalogTrigger[],
      };

    case 'bottoms':
      if (hasAny(text, ['nylon', 'quick dry', 'rain'])) {
        return {
          minTemp: 15,
          maxTemp: 28,
          layerWeight: 'light' as const,
          waterproof: true,
          windResistant: false,
          moods: ['functional', 'sporty'] as CatalogMood[],
          triggers: ['rain', 'mild'] as CatalogTrigger[],
        };
      }

      return {
        minTemp: 10,
        maxTemp: 24,
        layerWeight: 'mid' as const,
        waterproof: false,
        windResistant: false,
        moods: ['minimal', 'commuter'] as CatalogMood[],
        triggers: ['mild', 'swing'] as CatalogTrigger[],
      };

    case 'shoes':
      if (hasAny(text, ['waterproof', 'trail', 'grip'])) {
        return {
          minTemp: 6,
          maxTemp: 22,
          layerWeight: 'mid' as const,
          waterproof: true,
          windResistant: false,
          moods: ['functional', 'sporty'] as CatalogMood[],
          triggers: ['rain'] as CatalogTrigger[],
        };
      }

      return {
        minTemp: 11,
        maxTemp: 25,
        layerWeight: 'light' as const,
        waterproof: false,
        windResistant: false,
        moods: ['formal', 'commuter'] as CatalogMood[],
        triggers: ['mild', 'swing'] as CatalogTrigger[],
      };
  }
}

function buildBadge(
  traits: ReturnType<typeof inferCatalogTraits>,
  category: ClosetCategoryKey,
) {
  if (traits.waterproof) {
    return '비 예보';
  }

  if (traits.layerWeight === 'heavy') {
    return '보온 보강';
  }

  if (category === 'outerwear') {
    return '레이어드';
  }

  if (category === 'tops') {
    return '출근 기본';
  }

  return '무드 전환';
}

function buildReason(
  traits: ReturnType<typeof inferCatalogTraits>,
  category: ClosetCategoryKey,
) {
  if (traits.waterproof) {
    return '비 오는 날에도 부담이 적은 선택';
  }

  if (traits.layerWeight === 'heavy') {
    return '아침 체감이 낮을 때 보온을 더하기 좋음';
  }

  if (category === 'outerwear') {
    return '일교차 큰 날 벗고 들기 쉬운 가벼운 레이어';
  }

  if (category === 'tops') {
    return '무난한 날씨에 출근 룩을 정리하기 좋은 기본 아이템';
  }

  if (category === 'shoes') {
    return '마무리를 깔끔하게 잡아주는 출근용 선택';
  }

  return '지금 온도대에 무난하게 붙일 수 있는 기본 아이템';
}

function inferSubcategory(name: string, category: ClosetCategoryKey) {
  const text = name.toLowerCase();

  if (hasAny(text, ['shirt'])) {
    return 'shirt';
  }

  if (hasAny(text, ['cardigan'])) {
    return 'cardigan';
  }

  if (hasAny(text, ['coat'])) {
    return 'coat';
  }

  if (hasAny(text, ['runner', 'loafer', 'derby'])) {
    return 'shoes';
  }

  return category;
}

function buildSlug(brand: string, name: string, externalId: string) {
  const raw = `${brand}-${name}-${externalId}`.toLowerCase();

  return raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatPriceLabel(priceKrw: number) {
  return `${new Intl.NumberFormat('ko-KR').format(priceKrw)}원`;
}

function buildSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildThumbnailUrl(input: {
  brand: string;
  name: string;
  category: ClosetCategoryKey;
}) {
  return `catalog-placeholder://${buildSlug(
    input.brand,
    input.name,
    input.category,
  )}`;
}

function hasAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}
