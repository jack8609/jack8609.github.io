import { validateProfile } from './schema.js';

const PROFILES_KEY = 'fieldMappingProfiles';
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = { fuzzyMatchAllowed: false };

// storageArea 需實作 { get(key), set(entries) } 的 Promise 介面（chrome.storage.local 本身即符合）。
export function createProfileStore(storageArea = globalThis.chrome?.storage?.local) {
  if (!storageArea) {
    throw new Error('createProfileStore 需要 storageArea，且找不到 chrome.storage.local');
  }

  async function listProfiles() {
    const data = await storageArea.get(PROFILES_KEY);
    return data[PROFILES_KEY] || {};
  }

  async function getProfile(siteId) {
    const all = await listProfiles();
    return all[siteId] || null;
  }

  async function saveProfile(profile) {
    const validation = validateProfile(profile);
    if (!validation.valid) {
      throw new Error(`profile 無效: ${validation.errors.join('; ')}`);
    }
    const all = await listProfiles();
    all[profile.siteId] = profile;
    await storageArea.set({ [PROFILES_KEY]: all });
    return profile;
  }

  async function deleteProfile(siteId) {
    const all = await listProfiles();
    delete all[siteId];
    await storageArea.set({ [PROFILES_KEY]: all });
  }

  async function exportProfiles() {
    const all = await listProfiles();
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), profiles: all }, null, 2);
  }

  async function importProfiles(json) {
    const parsed = JSON.parse(json);
    const incoming = parsed.profiles || {};
    const errors = [];
    for (const [siteId, profile] of Object.entries(incoming)) {
      const validation = validateProfile(profile);
      if (!validation.valid) errors.push(`${siteId}: ${validation.errors.join('; ')}`);
    }
    if (errors.length) {
      throw new Error(`匯入失敗: ${errors.join(' | ')}`);
    }
    const all = { ...(await listProfiles()), ...incoming };
    await storageArea.set({ [PROFILES_KEY]: all });
    return Object.keys(incoming).length;
  }

  async function getSettings() {
    const data = await storageArea.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
  }

  async function saveSettings(settings) {
    await storageArea.set({ [SETTINGS_KEY]: settings });
  }

  return {
    listProfiles, getProfile, saveProfile, deleteProfile,
    exportProfiles, importProfiles, getSettings, saveSettings
  };
}
