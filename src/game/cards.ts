import type { CardDef, FacilityId, Icon, LandmarkDef, LandmarkId } from './types';

export const FACILITIES: Record<FacilityId, CardDef> = {
  wheat: {
    id: 'wheat', name: '麦畑', color: 'blue', rolls: [1], cost: 1, icon: 'wheat', emoji: '🌾',
    description: '誰の手番でも：銀行から1コイン', income: 1, stock: 6,
  },
  ranch: {
    id: 'ranch', name: '牧場', color: 'blue', rolls: [2], cost: 1, icon: 'cow', emoji: '🐄',
    description: '誰の手番でも：銀行から1コイン', income: 1, stock: 6,
  },
  bakery: {
    id: 'bakery', name: 'パン屋', color: 'green', rolls: [2, 3], cost: 1, icon: 'shop', emoji: '🍞',
    description: '自分の手番：銀行から1コイン', income: 1, stock: 6,
  },
  cafe: {
    id: 'cafe', name: 'カフェ', color: 'red', rolls: [3], cost: 2, icon: 'cup', emoji: '☕',
    description: '相手の手番：振った人から1コイン', income: 1, stock: 6,
  },
  convenience: {
    id: 'convenience', name: 'コンビニ', color: 'green', rolls: [4], cost: 2, icon: 'shop', emoji: '🏪',
    description: '自分の手番：銀行から3コイン', income: 3, stock: 6,
  },
  forest: {
    id: 'forest', name: '森', color: 'blue', rolls: [5], cost: 3, icon: 'gear', emoji: '🌲',
    description: '誰の手番でも：銀行から1コイン', income: 1, stock: 6,
  },
  stadium: {
    id: 'stadium', name: 'スタジアム', color: 'purple', rolls: [6], cost: 6, icon: 'major', emoji: '🏟️',
    description: '自分の手番：他の全員から2コインずつ', income: 2, stock: 'players',
  },
  tv: {
    id: 'tv', name: 'テレビ局', color: 'purple', rolls: [6], cost: 7, icon: 'major', emoji: '📺',
    description: '自分の手番：好きな1人から5コイン', income: 5, stock: 'players',
  },
  business: {
    id: 'business', name: 'ビジネスセンター', color: 'purple', rolls: [6], cost: 8, icon: 'major', emoji: '🏢',
    description: '自分の手番：好きな1人と施設を1枚交換（紫は交換不可）', income: 0, stock: 'players',
  },
  cheese: {
    id: 'cheese', name: 'チーズ工場', color: 'green', rolls: [7], cost: 5, icon: 'factory', emoji: '🧀',
    description: '自分の手番：自分の🐄の枚数 × 3コイン', income: 3, multiplierIcons: ['cow'], stock: 6,
  },
  furniture: {
    id: 'furniture', name: '家具工場', color: 'green', rolls: [8], cost: 3, icon: 'factory', emoji: '🪑',
    description: '自分の手番：自分の⚙️の枚数 × 3コイン', income: 3, multiplierIcons: ['gear'], stock: 6,
  },
  mine: {
    id: 'mine', name: '鉱山', color: 'blue', rolls: [9], cost: 6, icon: 'gear', emoji: '⛏️',
    description: '誰の手番でも：銀行から5コイン', income: 5, stock: 6,
  },
  restaurant: {
    id: 'restaurant', name: 'ファミレス', color: 'red', rolls: [9, 10], cost: 3, icon: 'cup', emoji: '🍽️',
    description: '相手の手番：振った人から2コイン', income: 2, stock: 6,
  },
  apple: {
    id: 'apple', name: 'りんご園', color: 'blue', rolls: [10], cost: 3, icon: 'wheat', emoji: '🍎',
    description: '誰の手番でも：銀行から3コイン', income: 3, stock: 6,
  },
  market: {
    id: 'market', name: '青果市場', color: 'green', rolls: [11, 12], cost: 2, icon: 'fruit', emoji: '🥬',
    description: '自分の手番：自分の🌾の枚数 × 2コイン', income: 2, multiplierIcons: ['wheat'], stock: 6,
  },
};

export const LANDMARKS: Record<LandmarkId, LandmarkDef> = {
  station: { id: 'station', name: '駅', cost: 4, emoji: '🚉', description: 'サイコロを1個か2個、選んで振れる' },
  mall: { id: 'mall', name: 'ショッピングモール', cost: 10, emoji: '🛍️', description: '自分の🏪と☕のカードの収入が1枚につき+1' },
  park: { id: 'park', name: '遊園地', cost: 16, emoji: '🎡', description: '2個振りでゾロ目が出たら、もう1回手番' },
  tower: { id: 'tower', name: '電波塔', cost: 22, emoji: '📡', description: '1手番に1回、サイコロを振り直せる' },
};

export const FACILITY_IDS = Object.keys(FACILITIES) as FacilityId[];
export const LANDMARK_IDS = Object.keys(LANDMARKS) as LandmarkId[];

/** モールで+1になるアイコン */
export const MALL_ICONS: Icon[] = ['shop', 'cup'];

export function isLandmarkId(id: string): id is LandmarkId {
  return id in LANDMARKS;
}

export function isFacilityId(id: string): id is FacilityId {
  return id in FACILITIES;
}
