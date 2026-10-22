import { deferred } from '../../../app/deferred'

// OB-165: sheets and cards the coach shows only after a tap or mid-conversation. Their code is
// not on the first owner screen; the app shell fetches it while the phone is idle.
export const CloseDay = deferred(() => import('../../closeday/CloseDay').then((m) => m.CloseDay))
export const ConnectSheet = deferred(() =>
  import('../../connect/ConnectSheet').then((m) => m.ConnectSheet),
)
export const SalesImportSheet = deferred(() =>
  import('../ImportMenu').then((m) => m.SalesImportSheet),
)
export const OrdersSheet = deferred(() =>
  import('../../sourcing/Orders').then((m) => m.OrdersSheet),
)
export const ShopSheets = deferred(() => import('../ShopTiles').then((m) => m.ShopSheets))
export const PaymentCard = deferred(() =>
  import('../../owner-tools/PaymentsScreen').then((m) => m.PaymentCard),
)
export const SupplierCarousel = deferred(() =>
  import('../../sourcing/SourcingCards').then((m) => m.SupplierCarousel),
)
export const OrderCard = deferred(() =>
  import('../../sourcing/SourcingCards').then((m) => m.OrderCard),
)
export const SearchingSuppliers = deferred(() =>
  import('../../sourcing/SourcingCards').then((m) => m.SearchingSuppliers),
)
export const SupplyChatCard = deferred(() =>
  import('../../supply/SupplyEntry').then((m) => m.SupplyChatCard),
)

/** Most likely first: the shop sheets (Menu, Messages) and the evening close. */
export const coachDeferred = [
  ShopSheets.preload,
  CloseDay.preload,
  SalesImportSheet.preload,
  ConnectSheet.preload,
  OrdersSheet.preload,
  SupplierCarousel.preload,
  SupplyChatCard.preload,
  PaymentCard.preload,
]
