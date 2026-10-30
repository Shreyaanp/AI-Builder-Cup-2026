/** Shapes of the sourcing events and order records (backend/app/sourcing.py). */

export interface SupplierCard {
  rank: number
  id: string
  name: string
  distance_km: number
  demo: boolean
  delivery: string
  min_order: string
  /** Prices here are major units of the shop currency. */
  item: { name: string; price: number; unit: string; available: boolean }
  estimate: number | null
  in_stock: string[]
}

export interface SupplierResult {
  item: string
  quantity: number | null
  unit: string
  currency: string
  suppliers: SupplierCard[]
  generated_demo_suppliers: boolean
  approximate_location: boolean
  cheapest_id: string | null
  nearest_id: string | null
}

export interface OrderLine {
  name: string
  quantity: number
  unit: string
  /** Minor units per unit; null when the supplier does not stock it. */
  price: number | null
  total: number | null
  available: boolean
}

export interface OrderMessage {
  id: string
  author: 'owner' | 'supplier'
  text: string
  created: number
  kind: 'order' | 'text' | 'cancel'
  /** An automatic reply from a demo supplier. */
  auto?: boolean
}

export type OrderStatus =
  'draft' | 'sent' | 'confirmed' | 'needs_reply' | 'cancelled' | 'replaced' | 'received'

export interface Order {
  id: string
  version: number
  status: OrderStatus
  supplier: {
    id: string
    name: string
    demo: boolean
    distance_km: number | null
    delivery: string
    min_order: string
  }
  shop_name: string
  currency: string
  lines: OrderLine[]
  /** Minor units. */
  total: number
  delivery_at: string
  delivery: string
  note: string
  created: number
  updated: number
  messages: OrderMessage[]
  /** A message or cancellation the coach prepared; sent when the owner taps Send. */
  pending: { kind: 'text' | 'cancel'; text: string; created: number } | null
  reply_due: number | null
  unread: boolean
  /** The draft this one replaced ("change it to 30 kg"); that draft can no longer be sent. */
  replaces?: string
  /** The order that replaced this draft after an edit; unset when the owner discarded it. */
  replaced_by?: string
}
