import { Button } from '@mui/material'
import { useGrowCopy } from '../v1/growCopy'
import { Sheet } from '../v1/Sheet'
import { SupplierDetails } from './SupplierDetails'

/** A supplier opened from the list. Order is the same tap as the row's own Order. */
export function SupplierSheet({
  supplier,
  onClose,
  onOrder,
}: {
  supplier: { id: string; name: string } | null
  onClose: () => void
  onOrder: () => void
}) {
  const grow = useGrowCopy()
  return (
    <Sheet
      open={supplier !== null}
      onClose={onClose}
      titleId="supplier-title"
      title={supplier?.name ?? ''}
      actions={
        <Button variant="contained" sx={{ minHeight: 48 }} onClick={onOrder}>
          {grow.order}
        </Button>
      }
    >
      {supplier && <SupplierDetails id={supplier.id} name={supplier.name} />}
    </Sheet>
  )
}
