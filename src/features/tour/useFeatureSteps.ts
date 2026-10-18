import { useCopy } from '../v1/strings'

/** Reuse translated feature labels for the closing tour stops. */
export function useFeatureSteps() {
  const t = useCopy()
  return [
    { title: t.importMenu, body: t.photoReviewNotes },
    { title: t.firstCustomers, body: `${t.printPoster} · ${t.shareWhatsApp}` },
    { title: t.newShopReady, body: t.newShopReadyBody },
  ]
}
