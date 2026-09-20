export function getCurrentSiteActionState(ctx) {
  const isRegistered = Boolean(ctx?.supported && ctx.granted);
  const hasProfile = Boolean(ctx?.profile);
  const hasMappedFields = hasProfile && ctx.profile.fieldOrder.length > 0;

  return {
    canRegister: Boolean(ctx?.supported && !ctx.granted),
    canFill: isRegistered && hasMappedFields,
    canEditMapping: isRegistered,
    canRevoke: isRegistered,
    canDeleteProfile: isRegistered && hasProfile
  };
}

export function getProfileListActionState(currentCtx, profile) {
  const isCurrentSite = Boolean(currentCtx?.supported && currentCtx.siteId === profile.siteId);
  // 分頁對得上但權限已被收回（例如取消註冊後）不算「目前網站」，否則會跟上方「尚未註冊」互相矛盾。
  const canEditMapping = isCurrentSite && Boolean(currentCtx.granted);
  return { isCurrentSite, canEditMapping };
}

export function normalizeDisplayName(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}