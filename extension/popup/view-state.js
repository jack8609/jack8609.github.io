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
  return { isCurrentSite, canEditMapping: isCurrentSite };
}

export function normalizeDisplayName(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}