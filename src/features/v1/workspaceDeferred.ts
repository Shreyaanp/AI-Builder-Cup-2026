import { deferred } from '../../app/deferred'

// OB-165: the review and edit dialogs open after a tap or a coach proposal; their code (the map,
// the guided details) is not on the first owner screen. The app shell fetches it while idle.
export const ReviewDialog = deferred(() => import('./ReviewDialog').then((m) => m.ReviewDialog))
export const BusinessDialog = deferred(() => import('./EditDialogs').then((m) => m.BusinessDialog))
export const ProductDialog = deferred(() => import('./EditDialogs').then((m) => m.ProductDialog))

export const workspaceDeferred = [
  ReviewDialog.preload,
  BusinessDialog.preload,
  ProductDialog.preload,
]
