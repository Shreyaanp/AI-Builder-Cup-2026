import { useCallback } from 'react'
import type { components } from '../../../api/generated'
import { useCustomer } from '../../customer/account'
import { setPassport, usePassport, where } from '../store'
import type { PassportView } from '../store'

type Schemas = components['schemas']
export type GamesView = Schemas['GamesView']
export type ScratchView = Schemas['ScratchView']
export type SetView = Schemas['SetView']
export type CoopView = Schemas['CoopView']
export type NextReward = Schemas['NextReward']
export type WonPerk = Schemas['WonPerk']
export type Odd = Schemas['Odd']
export type PrizeKind = Odd['prize']
export type ShopGames = Schemas['ShopGames']
export type PerkTrigger = Schemas['Perk']['trigger']
type Place = { lat: number; lng: number } | null | undefined

/**
 * Game actions. Every outcome is decided on the server; each call returns the whole passport,
 * which becomes the one source of truth on the phone.
 */
export function useGameActions(place?: Place) {
  const { api } = useCustomer()
  const query = where(place)
  const post = useCallback(
    <T>(path: string, body?: object) =>
      api<T>(`/api/v1/customer/games/${path}?${query}`, {
        method: 'POST',
        ...(body && { body: JSON.stringify(body) }),
      }),
    [api, query],
  )
  return {
    /** Scratching opens the card on the server, once; the prize is applied there. */
    reveal: useCallback(
      async (id: string) => {
        const result = await post<{ card: ScratchView; passport: PassportView }>(
          `scratch/${encodeURIComponent(id)}/reveal`,
        )
        return result
      },
      [post],
    ),
    freeze: useCallback(
      async (week: 'this' | 'next') => {
        const result = await post<{ verdict: string; passport: PassportView }>('freeze', { week })
        setPassport(result.passport)
        return result.verdict
      },
      [post],
    ),
    claimCoop: useCallback(
      async (coop: CoopView) => {
        setPassport(await post<PassportView>('coop/claim', { area: coop.area, week: coop.week }))
      },
      [post],
    ),
    markPerkUsed: useCallback(
      async (id: string) => {
        setPassport(await post<PassportView>(`perks/${encodeURIComponent(id)}/use`))
      },
      [post],
    ),
  }
}

/**
 * The front door's entry point: the game summary for the
 * current account, kept fresh with the passport. Signed out, it is drawn from this phone.
 */
export function useGames(place?: Place) {
  const { view, status, refresh, signedIn } = usePassport(place ?? null)
  const games = view?.games ?? null
  return {
    status,
    signedIn,
    refresh,
    passport: view,
    games,
    /** The single next named reward ("2 more stamps → free bun maska"). */
    next: games?.next_reward ?? null,
    /** Scratch cards waiting to be scratched (signed in only). */
    scratch: games?.scratch ?? [],
    streak: view?.streak ?? null,
    coop: games?.coop ?? null,
    nudge: games?.nudge ?? false,
  }
}

/** A shop's game facts for its page: odds, welcome stamps, thank-yous, social proof. */
export async function shopGames(shop: string, signal?: AbortSignal): Promise<ShopGames> {
  const response = await fetch(`/api/v1/public/shops/${encodeURIComponent(shop)}/games`, {
    signal: signal ?? AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as ShopGames
}
