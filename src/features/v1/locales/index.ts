import type { CopyLoaders } from '../../../i18n/lazyCopy'
import type { Copy } from '../strings'

/** Complete APAC owner copy, one chunk per language; English is supplied by strings.ts. */
export const loaders: CopyLoaders<Copy> = {
  hi: () => import('./hi').then((m) => m.hi),
  bn: () => import('./bn').then((m) => m.bn),
  te: () => import('./te').then((m) => m.te),
  mr: () => import('./mr').then((m) => m.mr),
  kn: () => import('./kn').then((m) => m.kn),
  'zh-Hans': () => import('./zh-Hans').then((m) => m.zhHans),
  ms: () => import('./ms').then((m) => m.ms),
  ta: () => import('./ta').then((m) => m.ta),
  ja: () => import('./ja').then((m) => m.ja),
  ko: () => import('./ko').then((m) => m.ko),
  id: () => import('./id').then((m) => m.id),
  th: () => import('./th').then((m) => m.th),
  vi: () => import('./vi').then((m) => m.vi),
  fil: () => import('./fil').then((m) => m.fil),
}
