export interface FieldMapping {
  source_field: string
  target_field: string
  confidence: number
  sample_values: string[]
}

export interface ConnectorMapping {
  source_label: string
  kind: 'menu' | 'sales'
  fields: FieldMapping[]
  confirmed: boolean
}

export interface DiffItem {
  action: 'added' | 'updated' | 'removed'
  name: string
  price?: number
  unit?: string
  stock?: number | null
  category?: string
  fields?: Record<string, { old: unknown; new: unknown }>
}

export interface ConnectorDiff {
  added: DiffItem[]
  updated: DiffItem[]
  removed: DiffItem[]
}

export interface ConnectorResult {
  mapping: ConnectorMapping
  preview_rows: Record<string, string>[]
  total_rows: number
  reused: boolean
  last_synced: number | null
  diff: ConnectorDiff | null
  warnings: string[]
}

export interface SavedMappingSummary {
  source_label: string
  fields: ConnectorMapping
  last_synced: number | null
  updated: number
}
