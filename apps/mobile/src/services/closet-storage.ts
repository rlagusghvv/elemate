import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createStarterClosetState,
  normalizeClosetState,
  type ClosetState,
} from '../data/sample-data';

const STORAGE_KEY = 'otnal/closet-state/v1';

export async function loadClosetState(): Promise<ClosetState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);

  if (raw == null) {
    return createStarterClosetState();
  }

  try {
    return normalizeClosetState(JSON.parse(raw) as ClosetState);
  } catch {
    return createStarterClosetState();
  }
}

export async function saveClosetState(state: ClosetState) {
  const normalized = normalizeClosetState(state);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
