import { deferred } from '../../app/deferred'

// OB-165: Today shows the needs list; the supply screens, order detail and the order card (with
// its motion library) load when opened. The app shell fetches them while the phone is idle.
export const OrderSheet = deferred(() => import('./OrderSheet').then((m) => m.OrderSheet))
export const SupplyHub = deferred(() => import('./SupplyHub').then((m) => m.SupplyHub))
export const PurchaseOrderCard = deferred(() =>
  import('./PurchaseOrderCard').then((m) => m.PurchaseOrderCard),
)

export const supplyDeferred = [PurchaseOrderCard.preload, SupplyHub.preload, OrderSheet.preload]
