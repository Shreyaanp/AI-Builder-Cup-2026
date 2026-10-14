import type { Locale } from '../../../i18n/locales'
import type { Copy } from '../strings'

/**
 * Native translations of the owner-app copy, one file per locale (e.g. `ja.ts` exporting
 * `const ja: Partial<Copy>`), registered here. English (`strings.ts`) is the source; any key a
 * locale omits falls back to English. Function-valued keys must keep the same signature.
 */
export const translations: Partial<Record<Locale, Partial<Copy>>> = {}
