export type TabKey = 'today' | 'closet';
export type FeedbackKey = 'perfect' | 'chilly' | 'warm';
export type ClosetCategoryKey = 'tops' | 'outerwear' | 'bottoms' | 'shoes';
export type TemperatureBiasKey = 'very-cold' | 'cold' | 'neutral' | 'warm';
export type CommuteModeKey = 'indoors' | 'mixed' | 'long-walk';
export type NotificationTimeKey = '06:50' | '07:10' | '07:30';

export type ClosetItem = {
  id: string;
  name: string;
  minTemp: number;
  maxTemp: number;
  role: string;
  materials?: string[];
  source?: 'starter' | 'name-analysis';
};

export type ClosetSelection = Record<ClosetCategoryKey, string[]>;
export type ClosetCustomItems = Record<ClosetCategoryKey, ClosetItem[]>;

export type ClosetState = {
  selectedItemIds: ClosetSelection;
  customItems: ClosetCustomItems;
  preference: {
    temperatureBias: TemperatureBiasKey;
    commuteMode: CommuteModeKey;
    notificationTime: NotificationTimeKey;
    tags: string[];
  };
  setupCompletedAt: string | null;
};

export type ClosetProfile = {
  totalItems: number;
  categories: Array<{
    key: ClosetCategoryKey;
    name: string;
    count: number;
    highlight: string;
  }>;
  preference: {
    temperatureBiasLabel: string;
    temperatureOffset: number;
    commuteMode: string;
    commuteOffset: number;
    notificationTime: string;
    tags: string[];
  };
  inventory: Record<ClosetCategoryKey, ClosetItem[]>;
};

export const feedbackLabels: Record<FeedbackKey, string> = {
  perfect: '딱 맞음',
  chilly: '조금 추움',
  warm: '조금 더움',
};

export const temperatureBiasOptions: Array<{
  key: TemperatureBiasKey;
  label: string;
  offset: number;
}> = [
  { key: 'very-cold', label: '추위를 많이 탐', offset: -3 },
  { key: 'cold', label: '추위를 조금 탐', offset: -1 },
  { key: 'neutral', label: '보통', offset: 0 },
  { key: 'warm', label: '더위를 조금 탐', offset: 2 },
];

export const commuteModeOptions: Array<{
  key: CommuteModeKey;
  label: string;
  offset: number;
}> = [
  { key: 'indoors', label: '실내 이동 위주', offset: 1 },
  { key: 'mixed', label: '도보 10분 + 대중교통', offset: 0 },
  { key: 'long-walk', label: '도보 20분 이상', offset: -1 },
];

export const notificationTimeOptions: Array<{
  key: NotificationTimeKey;
  label: string;
}> = [
  { key: '06:50', label: '오전 6:50' },
  { key: '07:10', label: '오전 7:10' },
  { key: '07:30', label: '오전 7:30' },
];

export const styleTagOptions = [
  '미니멀 캐주얼',
  '셔츠 자주 입음',
  '레이어드 가능',
  '포멀 선호',
  '비 오는 날 대비',
] as const;

export const categoryDefinitions: Array<{
  key: ClosetCategoryKey;
  name: string;
  helper: string;
}> = [
  {
    key: 'tops',
    name: '상의',
    helper: '체감 온도에 맞는 기본 상의를 먼저 고르세요.',
  },
  {
    key: 'outerwear',
    name: '아우터',
    helper: '일교차나 바람이 있을 때 걸칠 옷입니다.',
  },
  {
    key: 'bottoms',
    name: '하의',
    helper: '비 오는 날에도 괜찮은 하의 하나는 남겨두세요.',
  },
  {
    key: 'shoes',
    name: '신발',
    helper: '기본 신발과 비 대비 신발을 같이 두면 안정적입니다.',
  },
];

export const closetCatalog: Record<ClosetCategoryKey, ClosetItem[]> = {
  tops: [
    {
      id: 'short-sleeve-tee',
      name: '반팔 티셔츠',
      minTemp: 20,
      maxTemp: 32,
      role: '더운 날 가장 가볍게 입는 기본 상의',
      materials: ['코튼'],
      source: 'starter',
    },
    {
      id: 'long-sleeve-tee',
      name: '긴팔 티셔츠',
      minTemp: 15,
      maxTemp: 24,
      role: '간절기에 부담 없이 입는 기본 상의',
      materials: ['코튼'],
      source: 'starter',
    },
    {
      id: 'oxford-shirt',
      name: '옥스포드 셔츠',
      minTemp: 11,
      maxTemp: 23,
      role: '출근용으로 가장 무난한 셔츠',
      materials: ['코튼'],
      source: 'starter',
    },
    {
      id: 'sweatshirt',
      name: '스웨트셔츠',
      minTemp: 10,
      maxTemp: 18,
      role: '캐주얼하게 입기 좋은 간절기 상의',
      materials: ['코튼'],
      source: 'starter',
    },
    {
      id: 'merino-knit',
      name: '메리노 니트',
      minTemp: 4,
      maxTemp: 15,
      role: '서늘한 아침에 보온을 더해주는 상의',
      materials: ['메리노 울'],
      source: 'starter',
    },
  ],
  outerwear: [
    {
      id: 'light-windbreaker',
      name: '라이트 바람막이',
      minTemp: 8,
      maxTemp: 18,
      role: '바람과 약한 비를 막기 좋은 가벼운 아우터',
      materials: ['나일론'],
      source: 'starter',
    },
    {
      id: 'cotton-cardigan',
      name: '코튼 가디건',
      minTemp: 11,
      maxTemp: 20,
      role: '실내외 이동이 많은 날 가볍게 걸치는 레이어',
      materials: ['코튼'],
      source: 'starter',
    },
    {
      id: 'navy-blazer',
      name: '네이비 블레이저',
      minTemp: 12,
      maxTemp: 22,
      role: '출근 룩 정돈감을 살리는 아우터',
      materials: ['울 블렌드'],
      source: 'starter',
    },
    {
      id: 'wool-coat',
      name: '울 코트',
      minTemp: -4,
      maxTemp: 9,
      role: '초봄과 늦가을 아침 보온용 코트',
      materials: ['울'],
      source: 'starter',
    },
  ],
  bottoms: [
    {
      id: 'cream-cotton-pants',
      name: '크림 코튼 팬츠',
      minTemp: 11,
      maxTemp: 24,
      role: '대부분의 출근 날씨에 맞는 기본 하의',
      materials: ['코튼'],
      source: 'starter',
    },
    {
      id: 'dark-denim',
      name: '다크 데님',
      minTemp: 4,
      maxTemp: 18,
      role: '바람이 있거나 비가 올 때 안정적인 하의',
      materials: ['데님'],
      source: 'starter',
    },
    {
      id: 'nylon-pants',
      name: '나일론 팬츠',
      minTemp: 18,
      maxTemp: 30,
      role: '습하거나 따뜻한 날에 덜 답답한 하의',
      materials: ['나일론'],
      source: 'starter',
    },
    {
      id: 'charcoal-slacks',
      name: '차콜 슬랙스',
      minTemp: 10,
      maxTemp: 23,
      role: '조금 더 포멀한 출근 룩에 맞는 하의',
      materials: ['울 블렌드'],
      source: 'starter',
    },
  ],
  shoes: [
    {
      id: 'white-sneakers',
      name: '화이트 스니커즈',
      minTemp: 10,
      maxTemp: 28,
      role: '맑은 날 기본 선택',
      materials: ['캔버스'],
      source: 'starter',
    },
    {
      id: 'waterproof-sneakers',
      name: '발수 스니커즈',
      minTemp: 6,
      maxTemp: 24,
      role: '비 확률이 있을 때 우선 선택',
      materials: ['나일론'],
      source: 'starter',
    },
    {
      id: 'black-loafers',
      name: '블랙 로퍼',
      minTemp: 12,
      maxTemp: 24,
      role: '깔끔한 출근룩 마감용',
      materials: ['레더'],
      source: 'starter',
    },
    {
      id: 'leather-derby',
      name: '레더 더비',
      minTemp: 8,
      maxTemp: 20,
      role: '포멀한 날 단정하게 마무리하는 신발',
      materials: ['레더'],
      source: 'starter',
    },
  ],
};

const starterClosetSelection: ClosetSelection = {
  tops: ['short-sleeve-tee', 'oxford-shirt', 'merino-knit'],
  outerwear: ['light-windbreaker', 'navy-blazer', 'wool-coat'],
  bottoms: ['cream-cotton-pants', 'dark-denim', 'nylon-pants'],
  shoes: ['white-sneakers', 'waterproof-sneakers', 'black-loafers'],
};

const defaultPreference: ClosetState['preference'] = {
  temperatureBias: 'cold',
  commuteMode: 'mixed',
  notificationTime: '07:10',
  tags: ['미니멀 캐주얼', '셔츠 자주 입음', '레이어드 가능'],
};

export function createEmptyCustomItems(): ClosetCustomItems {
  return {
    tops: [],
    outerwear: [],
    bottoms: [],
    shoes: [],
  };
}

export function createStarterClosetState(): ClosetState {
  return {
    selectedItemIds: {
      tops: [...starterClosetSelection.tops],
      outerwear: [...starterClosetSelection.outerwear],
      bottoms: [...starterClosetSelection.bottoms],
      shoes: [...starterClosetSelection.shoes],
    },
    customItems: createEmptyCustomItems(),
    preference: {
      ...defaultPreference,
      tags: [...defaultPreference.tags],
    },
    setupCompletedAt: new Date().toISOString(),
  };
}

export function normalizeClosetState(
  input: Partial<ClosetState> | null | undefined,
): ClosetState {
  const starter = createStarterClosetState();
  const customItems = normalizeCustomItems(input?.customItems);
  const catalog = mergeCatalogWithCustomItems(customItems);
  const selectedItemIds: ClosetSelection = {
    tops: sanitizeIds('tops', input?.selectedItemIds?.tops, catalog.tops, starter),
    outerwear: sanitizeIds(
      'outerwear',
      input?.selectedItemIds?.outerwear,
      catalog.outerwear,
      starter,
    ),
    bottoms: sanitizeIds(
      'bottoms',
      input?.selectedItemIds?.bottoms,
      catalog.bottoms,
      starter,
    ),
    shoes: sanitizeIds('shoes', input?.selectedItemIds?.shoes, catalog.shoes, starter),
  };

  const temperatureBias = temperatureBiasOptions.some(
    (option) => option.key === input?.preference?.temperatureBias,
  )
    ? (input?.preference?.temperatureBias as TemperatureBiasKey)
    : starter.preference.temperatureBias;
  const commuteMode = commuteModeOptions.some(
    (option) => option.key === input?.preference?.commuteMode,
  )
    ? (input?.preference?.commuteMode as CommuteModeKey)
    : starter.preference.commuteMode;
  const notificationTime = notificationTimeOptions.some(
    (option) => option.key === input?.preference?.notificationTime,
  )
    ? (input?.preference?.notificationTime as NotificationTimeKey)
    : starter.preference.notificationTime;
  const tags = styleTagOptions.filter((tag) =>
    (input?.preference?.tags ?? starter.preference.tags).includes(tag),
  );

  const nextState: ClosetState = {
    selectedItemIds,
    customItems,
    preference: {
      temperatureBias,
      commuteMode,
      notificationTime,
      tags,
    },
    setupCompletedAt: input?.setupCompletedAt ?? starter.setupCompletedAt,
  };

  return hasEssentialCloset(nextState)
    ? {
        ...nextState,
        setupCompletedAt: nextState.setupCompletedAt ?? new Date().toISOString(),
      }
    : {
        ...nextState,
        setupCompletedAt: null,
      };
}

export function buildClosetProfile(state: ClosetState): ClosetProfile {
  const normalized = normalizeClosetState(state);
  const catalog = buildClosetCatalog(normalized);
  const inventory = {
    tops: resolveSelectedItems('tops', normalized.selectedItemIds.tops, catalog),
    outerwear: resolveSelectedItems(
      'outerwear',
      normalized.selectedItemIds.outerwear,
      catalog,
    ),
    bottoms: resolveSelectedItems('bottoms', normalized.selectedItemIds.bottoms, catalog),
    shoes: resolveSelectedItems('shoes', normalized.selectedItemIds.shoes, catalog),
  };
  const temperatureBias = getTemperatureBiasOption(normalized.preference.temperatureBias);
  const commuteMode = getCommuteModeOption(normalized.preference.commuteMode);
  const notificationTime = getNotificationTimeOption(
    normalized.preference.notificationTime,
  );

  return {
    totalItems:
      inventory.tops.length +
      inventory.outerwear.length +
      inventory.bottoms.length +
      inventory.shoes.length,
    categories: categoryDefinitions.map((category) => {
      const items = inventory[category.key];

      return {
        key: category.key,
        name: category.name,
        count: items.length,
        highlight:
          items.length > 0
            ? items.slice(0, 2).map((item) => item.name).join(', ')
            : '아직 선택한 옷이 없어요',
      };
    }),
    preference: {
      temperatureBiasLabel: temperatureBias.label,
      temperatureOffset: temperatureBias.offset,
      commuteMode: commuteMode.label,
      commuteOffset: commuteMode.offset,
      notificationTime: notificationTime.label,
      tags: normalized.preference.tags,
    },
    inventory,
  };
}

export function hasEssentialCloset(state: ClosetState) {
  return (
    state.selectedItemIds.tops.length > 0 &&
    state.selectedItemIds.bottoms.length > 0 &&
    state.selectedItemIds.shoes.length > 0
  );
}

export function buildClosetCatalog(
  state: Pick<ClosetState, 'customItems'> | ClosetState,
): Record<ClosetCategoryKey, ClosetItem[]> {
  const customItems = normalizeCustomItems(state.customItems);

  return mergeCatalogWithCustomItems(customItems);
}

export function appendCustomClosetItem(
  state: ClosetState,
  category: ClosetCategoryKey,
  item: ClosetItem,
): ClosetState {
  const existingItems = buildClosetCatalog(state)[category];

  if (existingItems.some((existingItem) => existingItem.id === item.id)) {
    return state;
  }

  return {
    ...state,
    customItems: {
      ...state.customItems,
      [category]: [...state.customItems[category], item],
    },
    selectedItemIds: {
      ...state.selectedItemIds,
      [category]: [...new Set([...state.selectedItemIds[category], item.id])],
    },
    setupCompletedAt: state.setupCompletedAt ?? new Date().toISOString(),
  };
}

export function getCategoryLabel(key: ClosetCategoryKey) {
  return categoryDefinitions.find((category) => category.key === key)?.name ?? key;
}

export function getTemperatureBiasOption(key: TemperatureBiasKey) {
  return (
    temperatureBiasOptions.find((option) => option.key === key) ??
    temperatureBiasOptions[1]
  );
}

export function getCommuteModeOption(key: CommuteModeKey) {
  return (
    commuteModeOptions.find((option) => option.key === key) ??
    commuteModeOptions[1]
  );
}

export function getNotificationTimeOption(key: NotificationTimeKey) {
  return (
    notificationTimeOptions.find((option) => option.key === key) ??
    notificationTimeOptions[1]
  );
}

export const automationPlan = [
  {
    time: '06:55',
    title: '날씨 수집',
    body: '현재 위치 또는 기본 위치의 기온, 체감, 바람, 강수 확률을 읽습니다.',
  },
  {
    time: '07:00',
    title: '옷장 매칭',
    body: '사용자 체질과 등록된 옷 범위를 기준으로 오늘 가능한 조합을 고릅니다.',
  },
  {
    time: '07:10',
    title: '추천 전달',
    body: '아침 푸시로 추천을 보내고, 사용자는 짧은 피드백만 남깁니다.',
  },
];

function sanitizeIds(
  category: ClosetCategoryKey,
  ids: string[] | undefined,
  items: ClosetItem[],
  starter: ClosetState,
) {
  const fallbackIds = ids == null ? starter.selectedItemIds[category] : ids;

  return items
    .map((item) => item.id)
    .filter((id) => fallbackIds.includes(id));
}

function resolveSelectedItems(
  category: ClosetCategoryKey,
  selectedIds: string[],
  catalog: Record<ClosetCategoryKey, ClosetItem[]> = closetCatalog,
) {
  return catalog[category].filter((item) => selectedIds.includes(item.id));
}

function normalizeCustomItems(input: Partial<ClosetCustomItems> | undefined) {
  return {
    tops: sanitizeCustomItems('tops', input?.tops),
    outerwear: sanitizeCustomItems('outerwear', input?.outerwear),
    bottoms: sanitizeCustomItems('bottoms', input?.bottoms),
    shoes: sanitizeCustomItems('shoes', input?.shoes),
  };
}

function sanitizeCustomItems(
  category: ClosetCategoryKey,
  items: ClosetItem[] | undefined,
) {
  if (items == null) {
    return [];
  }

  const unique = new Map<string, ClosetItem>();

  items.forEach((item) => {
    if (
      typeof item?.id !== 'string' ||
      item.id.length === 0 ||
      typeof item?.name !== 'string' ||
      item.name.trim().length === 0 ||
      typeof item?.minTemp !== 'number' ||
      typeof item?.maxTemp !== 'number' ||
      item.minTemp >= item.maxTemp
    ) {
      return;
    }

    unique.set(item.id, {
      id: item.id,
      name: item.name.trim(),
      minTemp: Math.round(item.minTemp),
      maxTemp: Math.round(item.maxTemp),
      role: item.role,
      materials: (item.materials ?? [])
        .filter((material) => typeof material === 'string' && material.length > 0)
        .slice(0, 4),
      source: item.source === 'starter' ? 'starter' : 'name-analysis',
    });
  });

  return Array.from(unique.values()).filter((item) =>
    categoryDefinitions.some((categoryDefinition) => categoryDefinition.key === category),
  );
}

function mergeCatalogWithCustomItems(customItems: ClosetCustomItems) {
  return {
    tops: [...closetCatalog.tops, ...customItems.tops],
    outerwear: [...closetCatalog.outerwear, ...customItems.outerwear],
    bottoms: [...closetCatalog.bottoms, ...customItems.bottoms],
    shoes: [...closetCatalog.shoes, ...customItems.shoes],
  };
}
