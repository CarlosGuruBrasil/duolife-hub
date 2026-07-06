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

  const value = raw as Partial<WhiteLabelConfig> & { links?: unknown; customTexts?: unknown; availableProductIds?: unknown };
  return {
    ...DEFAULT_WHITE_LABEL,
    ...value,
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
