import { useLocale } from '../../state/hooks'
import type { Locale } from '../../i18n/locales'

const en = {
  title: 'Plan tomorrow',
  product: 'Product',
  ready: 'Ready stock',
  capacity: 'Additional capacity',
  source: 'History source',
  owner: 'Your recorded sales',
  demo: 'Demo data — not your real sales',
  load: 'Review demo history',
  sold: "Today's sold count",
  record: 'Review sales entry',
  calculate: 'Calculate suggestion',
  insufficient:
    'Not enough history. Record at least three complete days or try labelled demo data.',
  details: 'Method and history',
  method:
    'Mean of the latest four complete days before the forecast date. Closed and missing days are excluded; complete zero-sales days count.',
  limited: 'Stockout days show limited sales, not lower demand, and are excluded.',
  events:
    'No festival, weather or promotion adjustment is assumed. Sold units are per product, not customers or ingredients. Corrections replace the same date and retain the previous value.',
  range: 'Range seen (not a prediction interval)',
  baseline: 'Mean baseline',
  additional: 'Additional preparation',
  gap: 'Unmet gap after ready stock and capacity',
  evaluation: 'Chronological backtest: MAE / last-value MAE',
  naive: 'Mean performed worse than last value. Preparation uses last value instead.',
  none: 'Not enough later complete days to evaluate.',
  date: 'Forecast date',
  window: 'Complete dates used',
  version: 'Dataset daily-v1; horizon one day; training ends before forecast date.',
  quantity: 'Your preparation quantity',
  accept: 'Review accepted plan',
  decline: 'Review declined plan',
  confirm: 'Confirm and save exact proposal',
  cancel: 'Cancel review',
  review: 'Check before saving',
  private:
    'Private planning note only. Google publishing is not connected. Stock, prices and your public page are unchanged.',
  saved: 'Saved private plan',
  stale: 'Stale plan — recalculate before using',
  error: 'Could not load or save planning. Retry; your inputs are preserved.',
  retry: 'Reload planning history',
  status: {
    complete: 'Complete',
    closed: 'Closed',
    missing: 'Missing',
    stockout: 'Stockout — limited sales',
  },
  decisions: { accepted: 'Accepted', edited: 'Edited', declined: 'Declined' },
}
/** Native planning translations per locale (English source; missing keys fall back). */
export const planningTranslations: Partial<Record<Locale, Partial<typeof en>>> = {}

export function useCopy() {
  return { ...en, ...planningTranslations[useLocale()] }
}
