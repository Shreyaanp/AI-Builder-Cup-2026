/**
 * Columns for a My shop tile in the content-sized grid. One column (168px+) fits about two
 * lines of the big value (~13 characters each) and two lines of supporting text (~22 each);
 * longer text gets two columns instead of a tall, narrow block.
 */
export function spanFor(value: string, supporting = ''): 1 | 2 {
  return value.length > 26 || supporting.length > 44 ? 2 : 1
}

/** The tile grid shared by Shop and Grow. */
export const tileGrid = {
  containerType: 'inline-size',
  containerName: 'tiles',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 168px), 1fr))',
  gridAutoFlow: 'row dense',
  gap: 3,
} as const
