export interface WhiteLabelLink {
  label: string;
  url: string;
}

export interface WhiteLabelConfig {
  slug: string;
  companyName: string;
  companySlogan: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  domain: string;
  subdomain: string;
  institutionText: string;
  footerText: string;
  publicTitle: string;
  publicDescription: string;
  wixCode: string;
  susep?: string;
  social?: {
    linkedin?: string;
    instagram?: string;
    facebook?: string;
  };
  links: WhiteLabelLink[];
  availableProductIds: string[];
  customTexts: Record<string, string>;
}

const DEFAULT_WHITE_LABEL: WhiteLabelConfig = {
  slug: '',
  companyName: '',
  companySlogan: '',
  companyPhone: '',
  companyEmail: '',
  companyWebsite: '',
  logoUrl: '',
  primaryColor: '#0e4a5a',
  secondaryColor: '#7fa8b2',
  accentColor: '#00d4e0',
  domain: '',
  subdomain: '',
  institutionText: '',
  footerText: '',
  publicTitle: '',
  publicDescription: '',
  wixCode: '',
  susep: '',
  social: {},
  links: [],
  availableProductIds: [],
  customTexts: {},
};

export function getWhiteLabelConfig(metadata: unknown): WhiteLabelConfig {
  const source = (metadata && typeof metadata === 'object' && !Array.isArray(metadata))
    ? (metadata as Record<string, unknown>)
    : {};
  const raw = source.whiteLabel;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_WHITE_LABEL };
  }

  const value = raw as Partial<WhiteLabelConfig> & { links?: unknown; customTexts?: unknown; availableProductIds?: unknown; social?: unknown };
  return {
    ...DEFAULT_WHITE_LABEL,
    ...value,
    social: value.social && typeof value.social === 'object' && !Array.isArray(value.social)
      ? (value.social as Record<string, string>)
      : {},
    links: Array.isArray(value.links)
      ? value.links.filter((item): item is WhiteLabelLink => !!item && typeof item === 'object')
      : [],
    availableProductIds: Array.isArray(value.availableProductIds)
      ? value.availableProductIds.filter((item): item is string => typeof item === 'string')
      : [],
    customTexts: value.customTexts && typeof value.customTexts === 'object' && !Array.isArray(value.customTexts)
      ? (value.customTexts as Record<string, string>)
      : {},
  };
}

export function mergeWhiteLabelConfig(metadata: unknown, patch: Partial<WhiteLabelConfig>) {
  const next = {
    ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {}),
    whiteLabel: {
      ...getWhiteLabelConfig(metadata),
      ...patch,
    },
  };

  return next;
}

/**
 * Resolve a identidade visual em cascata hierárquica:
 * Parceiro (prioridade de exibição) -> Corretora Mãe (fallback corporativo) -> Padrão DuoLife
 */
export function resolveHierarchicalWhiteLabel(
  partnerMetadata: unknown,
  corretoraMetadata?: unknown
): WhiteLabelConfig {
  const partnerConfig = getWhiteLabelConfig(partnerMetadata);
  if (!corretoraMetadata) return partnerConfig;

  const corretoraConfig = getWhiteLabelConfig(corretoraMetadata);

  return {
    ...corretoraConfig,
    ...partnerConfig,
    companyName: partnerConfig.companyName || corretoraConfig.companyName,
    companySlogan: partnerConfig.companySlogan || corretoraConfig.companySlogan,
    companyPhone: partnerConfig.companyPhone || corretoraConfig.companyPhone,
    companyEmail: partnerConfig.companyEmail || corretoraConfig.companyEmail,
    companyWebsite: partnerConfig.companyWebsite || corretoraConfig.companyWebsite,
    logoUrl: partnerConfig.logoUrl || corretoraConfig.logoUrl,
    primaryColor: (partnerConfig.primaryColor && partnerConfig.primaryColor !== DEFAULT_WHITE_LABEL.primaryColor)
      ? partnerConfig.primaryColor
      : (corretoraConfig.primaryColor || DEFAULT_WHITE_LABEL.primaryColor),
    secondaryColor: (partnerConfig.secondaryColor && partnerConfig.secondaryColor !== DEFAULT_WHITE_LABEL.secondaryColor)
      ? partnerConfig.secondaryColor
      : (corretoraConfig.secondaryColor || DEFAULT_WHITE_LABEL.secondaryColor),
    accentColor: (partnerConfig.accentColor && partnerConfig.accentColor !== DEFAULT_WHITE_LABEL.accentColor)
      ? partnerConfig.accentColor
      : (corretoraConfig.accentColor || DEFAULT_WHITE_LABEL.accentColor),
    susep: partnerConfig.susep || corretoraConfig.susep,
    social: {
      ...(corretoraConfig.social || {}),
      ...(partnerConfig.social || {}),
    },
  };
}
