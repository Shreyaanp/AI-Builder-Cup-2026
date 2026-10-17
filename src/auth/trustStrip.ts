export interface TrustStripConfig {
  enabled: boolean
  supportWhatsapp: string
}

export function readTrustStrip(value: unknown): TrustStripConfig {
  if (!value || typeof value !== 'object' || !('enabled' in value) || value.enabled !== true)
    return { enabled: false, supportWhatsapp: '' }
  const link = 'support_whatsapp' in value ? value.support_whatsapp : ''
  return {
    enabled: true,
    supportWhatsapp:
      typeof link === 'string' &&
      link === link.trim() &&
      /^https:\/\/wa\.me\/[1-9][0-9]{6,14}$/.test(link)
        ? link
        : '',
  }
}
