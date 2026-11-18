import type { CardDef, Expansion, FacilityId, GameOptions, GameState, Icon, LandmarkDef, LandmarkId, Player } from './types';

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

  // --- 港の拡張 ---------------------------------------------------------
  sushi: {
    id: 'sushi', name: '寿司屋', color: 'red', rolls: [1], cost: 4, icon: 'cup', emoji: '🍣',
    description: '相手の手番：港があれば、振った人から3コイン', income: 3, requires: 'harbor',
    expansion: 'harbor', stock: 6,
  },
  flower: {
    id: 'flower', name: '花畑', color: 'blue', rolls: [4], cost: 2, icon: 'wheat', emoji: '🌷',
    description: '誰の手番でも：銀行から1コイン', income: 1, expansion: 'harbor', stock: 6,
  },
  flowerShop: {
    id: 'flowerShop', name: '花屋', color: 'green', rolls: [6], cost: 1, icon: 'shop', emoji: '💐',
    description: '自分の手番：自分の花畑の枚数 × 1コイン', income: 1, multiplierCards: ['flower'],
    expansion: 'harbor', stock: 6,
  },
  mackerel: {
    id: 'mackerel', name: 'サバ漁船', color: 'blue', rolls: [8], cost: 2, icon: 'boat', emoji: '🐟',
    description: '誰の手番でも：港があれば、銀行から3コイン', income: 3, requires: 'harbor',
    expansion: 'harbor', stock: 6,
  },
  tuna: {
    id: 'tuna', name: 'マグロ漁船', color: 'blue', rolls: [12, 13, 14], cost: 5, icon: 'boat', emoji: '🚢',
    description: '誰の手番でも：港があれば、手番の人がサイコロ2個を振り、その合計のコインを銀行から',
    income: 0, requires: 'harbor', expansion: 'harbor', stock: 6,
  },
  warehouse: {
    id: 'warehouse', name: '食品倉庫', color: 'green', rolls: [12, 13], cost: 2, icon: 'factory', emoji: '📦',
    description: '自分の手番：自分の☕の枚数 × 2コイン', income: 2, multiplierIcons: ['cup'],
    expansion: 'harbor', stock: 6,
  },
  pizza: {
    id: 'pizza', name: 'ピザ屋', color: 'red', rolls: [7], cost: 1, icon: 'cup', emoji: '🍕',
    description: '相手の手番：振った人から1コイン', income: 1, expansion: 'harbor', stock: 6,
  },
  burger: {
    id: 'burger', name: 'ハンバーガー屋', color: 'red', rolls: [8], cost: 1, icon: 'cup', emoji: '🍔',
    description: '相手の手番：振った人から1コイン', income: 1, expansion: 'harbor', stock: 6,
  },
  publisher: {
    id: 'publisher', name: '出版社', color: 'purple', rolls: [7], cost: 5, icon: 'major', emoji: '📚',
    description: '自分の手番：相手全員から、☕と🏪のカード1枚につき1コインずつ', income: 1,
    expansion: 'harbor', stock: 'players',
  },
  tax: {
    id: 'tax', name: '税務署', color: 'purple', rolls: [8, 9], cost: 4, icon: 'major', emoji: '🏛️',
    description: '自分の手番：10コイン以上持っている相手全員から、半分（切り捨て）', income: 0,
    expansion: 'harbor', stock: 'players',
  },
};

export const LANDMARKS: Record<LandmarkId, LandmarkDef> = {
  station: { id: 'station', name: '駅', cost: 4, emoji: '🚉', description: 'サイコロを1個か2個、選んで振れる' },
  mall: { id: 'mall', name: 'ショッピングモール', cost: 10, emoji: '🛍️', description: '自分の🏪と☕のカードの収入が1枚につき+1' },
  park: { id: 'park', name: '遊園地', cost: 16, emoji: '🎡', description: '2個振りでゾロ目が出たら、もう1回手番' },
  tower: { id: 'tower', name: '電波塔', cost: 22, emoji: '📡', description: '1手番に1回、サイコロを振り直せる' },
  // 港の拡張
  harbor: {
    id: 'harbor', name: '港', cost: 2, emoji: '⚓', expansion: 'harbor',
    description: 'サイコロの合計が10以上なら、2を足してもよい',
  },
  airport: {
    id: 'airport', name: '空港', cost: 30, emoji: '✈️', expansion: 'harbor',
    description: '何も建てなかった手番は、銀行から10コイン',
  },
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

/** 基本セット・全種類（古い保存データや、設定を省略したとき） */
export const BASE_OPTIONS: GameOptions = { expansions: [], market: 'all' };

export function optionsOf(state: GameState): GameOptions {
  return state.options ?? BASE_OPTIONS;
}

const inEdition = (expansions: Expansion[], e?: Expansion) => e === undefined || expansions.includes(e);

/** このゲームで使う施設（基本＋選んだ拡張） */
export function facilityIdsFor(options: GameOptions): FacilityId[] {
  return FACILITY_IDS.filter((id) => inEdition(options.expansions, FACILITIES[id].expansion));
}

/** このゲームで使うランドマーク */
export function landmarkIdsFor(options: GameOptions): LandmarkId[] {
  return LANDMARK_IDS.filter((id) => inEdition(options.expansions, LANDMARKS[id].expansion));
}

/** そのプレイヤーのランドマーク（このゲームで使うもの。並びは LANDMARK_IDS の順） */
export function playerLandmarks(p: Player): LandmarkId[] {
  return LANDMARK_IDS.filter((id) => id in p.landmarks);
}

/** 出目の小さい順（同じなら定義順）。市場や街の並び */
export function byRoll(a: FacilityId, b: FacilityId): number {
  return FACILITIES[a].rolls[0] - FACILITIES[b].rolls[0] || FACILITY_IDS.indexOf(a) - FACILITY_IDS.indexOf(b);
}
