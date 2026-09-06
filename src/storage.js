import AsyncStorage from '@react-native-async-storage/async-storage';
import kv from './kv';
import repository from './repository';

export const { emptyState } = repository;
export const { loadState, persistState } = repository.createRepository(kv, AsyncStorage);
