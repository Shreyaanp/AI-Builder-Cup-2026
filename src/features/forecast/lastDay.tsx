import { Stack, Typography } from '@mui/material'
import type { components } from '../../api/generated'
import type { Locale } from '../../i18n/locales'
import { productName } from '../../i18n/productNames'
import { shopZone } from '../../region/region'
import { useLocale } from '../../state/hooks'
import { shopNow } from '../owner/time'
import { isMeasure } from '../shop/units'
import { dayLabel, useOrderUnit } from '../supply/supplyData'
import { useWorkspace } from '../v1/workspaceContext'

export type LastDay = components['schemas']['LastDay']
type Row = LastDay['rows'][number]

type Copy = {
  soldToday: string
  soldYesterday: string
  soldOn: (day: string) => string
  makeToday: string
  makeTomorrow: string
  home: (list: string) => string
}

const copy: Record<Locale, Copy> = {
  en: {
    soldToday: 'Today you sold',
    soldYesterday: 'Yesterday you sold',
    soldOn: (d) => `On ${d} you sold`,
    makeToday: 'Make about the same today.',
    makeTomorrow: 'Make about the same tomorrow.',
    home: (l) => `Make about the same: ${l}`,
  },
  'zh-Hans': {
    soldToday: '今天卖出',
    soldYesterday: '昨天卖出',
    soldOn: (d) => `${d} 卖出`,
    makeToday: '今天做差不多的量。',
    makeTomorrow: '明天做差不多的量。',
    home: (l) => `做差不多的量：${l}`,
  },
  ms: {
    soldToday: 'Hari ini anda menjual',
    soldYesterday: 'Semalam anda menjual',
    soldOn: (d) => `Pada ${d} anda menjual`,
    makeToday: 'Buat lebih kurang sama hari ini.',
    makeTomorrow: 'Buat lebih kurang sama esok.',
    home: (l) => `Buat lebih kurang sama: ${l}`,
  },
  ta: {
    soldToday: 'இன்று விற்றது',
    soldYesterday: 'நேற்று விற்றது',
    soldOn: (d) => `${d} அன்று விற்றது`,
    makeToday: 'இன்றும் ஏறக்குறைய அதே அளவு செய்யுங்கள்.',
    makeTomorrow: 'நாளையும் ஏறக்குறைய அதே அளவு செய்யுங்கள்.',
    home: (l) => `ஏறக்குறைய அதே அளவு செய்யுங்கள்: ${l}`,
  },
  ja: {
    soldToday: '今日の販売',
    soldYesterday: '昨日の販売',
    soldOn: (d) => `${d} の販売`,
    makeToday: '今日も同じくらい作りましょう。',
    makeTomorrow: '明日も同じくらい作りましょう。',
    home: (l) => `同じくらい作りましょう：${l}`,
  },
  ko: {
    soldToday: '오늘 판매',
    soldYesterday: '어제 판매',
    soldOn: (d) => `${d} 판매`,
    makeToday: '오늘도 비슷하게 만드세요.',
    makeTomorrow: '내일도 비슷하게 만드세요.',
    home: (l) => `비슷하게 만드세요: ${l}`,
  },
  id: {
    soldToday: 'Hari ini Anda menjual',
    soldYesterday: 'Kemarin Anda menjual',
    soldOn: (d) => `Pada ${d} Anda menjual`,
    makeToday: 'Buat kira-kira sama hari ini.',
    makeTomorrow: 'Buat kira-kira sama besok.',
    home: (l) => `Buat kira-kira sama: ${l}`,
  },
  th: {
    soldToday: 'วันนี้ขายได้',
    soldYesterday: 'เมื่อวานขายได้',
    soldOn: (d) => `${d} ขายได้`,
    makeToday: 'วันนี้ทำเท่า ๆ เดิม',
    makeTomorrow: 'พรุ่งนี้ทำเท่า ๆ เดิม',
    home: (l) => `ทำเท่า ๆ เดิม: ${l}`,
  },
  vi: {
    soldToday: 'Hôm nay bạn đã bán',
    soldYesterday: 'Hôm qua bạn đã bán',
    soldOn: (d) => `Ngày ${d} bạn đã bán`,
    makeToday: 'Hôm nay làm khoảng như vậy.',
    makeTomorrow: 'Ngày mai làm khoảng như vậy.',
    home: (l) => `Làm khoảng như vậy: ${l}`,
  },
  fil: {
    soldToday: 'Nabenta mo ngayon',
    soldYesterday: 'Nabenta mo kahapon',
    soldOn: (d) => `Nabenta mo noong ${d}`,
    makeToday: 'Gumawa ng halos ganoon din ngayon.',
    makeTomorrow: 'Gumawa ng halos ganoon din bukas.',
    home: (l) => `Gumawa ng halos ganoon din: ${l}`,
  },
  hi: {
    soldToday: 'आज आपने बेचा',
    soldYesterday: 'कल आपने बेचा',
    soldOn: (d) => `${d} को आपने बेचा`,
    makeToday: 'आज लगभग उतना ही बनाएँ।',
    makeTomorrow: 'कल लगभग उतना ही बनाएँ।',
    home: (l) => `लगभग उतना ही बनाएँ: ${l}`,
  },
  bn: {
    soldToday: 'আজ বিক্রি হয়েছে',
    soldYesterday: 'গতকাল বিক্রি হয়েছে',
    soldOn: (d) => `${d} বিক্রি হয়েছে`,
    makeToday: 'আজ প্রায় একই পরিমাণ বানান।',
    makeTomorrow: 'আগামীকাল প্রায় একই পরিমাণ বানান।',
    home: (l) => `প্রায় একই পরিমাণ বানান: ${l}`,
  },
  te: {
    soldToday: 'ఈరోజు అమ్మినవి',
    soldYesterday: 'నిన్న అమ్మినవి',
    soldOn: (d) => `${d} అమ్మినవి`,
    makeToday: 'ఈరోజు దాదాపు అంతే చేయండి.',
    makeTomorrow: 'రేపు దాదాపు అంతే చేయండి.',
    home: (l) => `దాదాపు అంతే చేయండి: ${l}`,
  },
  mr: {
    soldToday: 'आज विकले',
    soldYesterday: 'काल विकले',
    soldOn: (d) => `${d} ला विकले`,
    makeToday: 'आज साधारण तेवढेच बनवा.',
    makeTomorrow: 'उद्या साधारण तेवढेच बनवा.',
    home: (l) => `साधारण तेवढेच बनवा: ${l}`,
  },
  kn: {
    soldToday: 'ಇಂದು ಮಾರಾಟ',
    soldYesterday: 'ನಿನ್ನೆ ಮಾರಾಟ',
    soldOn: (d) => `${d} ಮಾರಾಟ`,
    makeToday: 'ಇಂದು ಸುಮಾರು ಅಷ್ಟೇ ಮಾಡಿ.',
    makeTomorrow: 'ನಾಳೆ ಸುಮಾರು ಅಷ್ಟೇ ಮಾಡಿ.',
    home: (l) => `ಸುಮಾರು ಅಷ್ಟೇ ಮಾಡಿ: ${l}`,
  },
}

/** A closed day in the owner's words: "Yesterday you sold", "2 kg", "2 kg Black forest cake". */
export function useLastDayWords() {
  const locale = useLocale()
  const unit = useOrderUnit()
  const { active } = useWorkspace()
  const c = copy[locale] ?? copy.en
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const amount = (row: Row) =>
    isMeasure(row.unit)
      ? `${number.format(row.quantity)} ${unit(row.unit)}`
      : number.format(row.quantity)
  const line = (row: Row) => `${amount(row)} ${productName(row.item, locale)}`
  const list = (rows: Row[]) =>
    new Intl.ListFormat(locale, { style: 'short', type: 'unit' }).format(rows.map(line))
  const today = shopNow(shopZone(active?.fields)).date
  const yesterday = new Date(`${today}T00:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const heading = (day: LastDay) =>
    day.date === today
      ? c.soldToday
      : day.date === yesterday.toISOString().slice(0, 10)
        ? c.soldYesterday
        : c.soldOn(dayLabel(day.date, locale))
  return {
    amount,
    list,
    heading,
    make: (day: LastDay) =>
      day.make_same ? (day.date === today ? c.makeTomorrow : c.makeToday) : '',
    /** Home's one line: what to make, from the day's made items, most money first. */
    home: (day: LastDay) => c.home(list(day.rows.filter((row) => row.made).slice(0, 2))),
    /** The Grow row's one line. */
    short: (day: LastDay) => `${heading(day)}: ${list(day.rows.slice(0, 2))}`,
  }
}

/** The plan until a forecast exists: what the closed day sold, and to make about the same. */
export function LastDayPlan({ day, lineClass }: { day: LastDay; lineClass?: string }) {
  const words = useLastDayWords()
  const locale = useLocale()
  const make = words.make(day)
  return (
    <Stack spacing={1} data-testid="last-day-plan">
      <Typography className={lineClass} variant="titleSmall" color="text.secondary">
        {words.heading(day)}
      </Typography>
      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {day.rows.map((row) => (
          <Stack
            component="li"
            key={row.item}
            className={lineClass}
            direction="row"
            sx={{ gap: 2, justifyContent: 'space-between', alignItems: 'baseline' }}
          >
            <Typography variant="bodyLarge" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              {productName(row.item, locale)}
            </Typography>
            <Typography
              variant="titleMedium"
              component="p"
              sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
            >
              {words.amount(row)}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {make && (
        <Typography className={lineClass} variant="bodyLarge" sx={{ pt: 1 }}>
          {make}
        </Typography>
      )}
    </Stack>
  )
}
