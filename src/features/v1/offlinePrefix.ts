/**
 * The offline coach starts its replies with a developer label ("Offline template: ...").
 * The owner never reads it; the reply says the same without it.
 */
const OFFLINE_PREFIX = /^\s*(?:Offline (?:template|coach|demo)|ऑफ़लाइन नमूना)\s*[:：]\s*/i

export function stripOfflinePrefix(text: string): string {
  return text.replace(OFFLINE_PREFIX, '')
}
