import { useSupplyCopy } from '../supply/copy'
import { useShowcaseCopy } from '../supply/showcaseCopy'
import { useCopy } from '../v1/strings'

/** Reuse translated feature labels for the new tour stops. */
export function useFeatureSteps() {
  const c = useSupplyCopy()
  const showcase = useShowcaseCopy()
  const t = useCopy()
  return [
    { title: showcase.title, body: `${showcase.reorder} · ${showcase.view}` },
    { title: c.title, body: [showcase.sent, showcase.shipping, showcase.received].join(' → ') },
    { title: showcase.sap, body: showcase.plain },
    { title: t.importMenu, body: t.photoReviewNotes },
    { title: t.firstCustomers, body: `${t.printPoster} · ${t.shareWhatsApp}` },
    { title: t.newShopReady, body: t.newShopReadyBody },
  ]
}
