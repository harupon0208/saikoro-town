// サイコロタウンの型定義。GameState はすべて JSON に変換できる形にする（関数・クラスを入れない）。

export type Color = 'blue' | 'green' | 'red' | 'purple';
export type Icon = 'wheat' | 'cow' | 'gear' | 'shop' | 'cup' | 'factory' | 'fruit' | 'major';

export type FacilityId =
  | 'wheat'
  | 'ranch'
  | 'bakery'
  | 'cafe'
  | 'convenience'
  | 'forest'
  | 'stadium'
  | 'tv'
  | 'business'
  | 'cheese'
  | 'furniture'
  | 'mine'
  | 'restaurant'
  | 'apple'
  | 'market';

export type LandmarkId = 'station' | 'mall' | 'park' | 'tower';

export interface CardDef {
  id: FacilityId;
  name: string;
  color: Color;
  rolls: number[];
  cost: number;
  icon: Icon;
  emoji: string;
  image?: string;
  description: string;
  /** 1枚あたりの基本収入（紫は効果ごとの値） */
  income: number;
  /** 工場・市場：このアイコンのカード枚数 × income を受け取る */
  multiplierIcons?: Icon[];
  /** 在庫。'players' はプレイ人数と同じ枚数 */
  stock: number | 'players';
}

export interface LandmarkDef {
  id: LandmarkId;
  name: string;
  cost: number;
  emoji: string;
  image?: string;
  description: string;
}

export type Personality = 'steady' | 'ranchFactory' | 'resourceFactory' | 'balanced';

export interface Player {
  id: number;
  name: string;
  isHuman: boolean;
  /** オンライン対戦のみ：この席を操作する端末の ID */
  owner?: string;
  /** CPU のみ。保存・再開しても同じ性格を使う */
  personality?: Personality;
  coins: number;
  cards: Record<FacilityId, number>;
  landmarks: Record<LandmarkId, boolean>;
}

export type Phase = 'chooseDice' | 'rolled' | 'resolving' | 'build' | 'gameOver';

export type PendingChoice =
  | { type: 'tv'; playerId: number }
  | { type: 'business'; playerId: number };

export interface LogEntry {
  turn: number;
  text: string;
}

export interface GameState {
  players: Player[];
  supply: Record<FacilityId, number>;
  current: number;
  phase: Phase;
  dice: number[];
  rerollUsed: boolean;
  /** 手番の通し番号（遊園地の追加手番では増えない） */
  turn: number;
  pendingChoice?: PendingChoice;
  log: LogEntry[];
  winner?: number;
}

export type Action =
  | { type: 'CHOOSE_DICE'; playerId: number; count: 1 | 2 }
  | { type: 'REROLL'; playerId: number }
  | { type: 'KEEP'; playerId: number }
  | { type: 'CHOOSE_TARGET'; playerId: number; targetId: number }
  | { type: 'SWAP'; playerId: number; targetId: number; give: FacilityId; take: FacilityId }
  | { type: 'SKIP_SWAP'; playerId: number }
  | { type: 'BUILD'; playerId: number; id: FacilityId | LandmarkId | null };

export type GameEvent =
  | { type: 'DICE_ROLLED'; playerId: number; dice: number[] }
  | { type: 'CARD_TRIGGERED'; playerId: number; cardId: FacilityId }
  | {
      type: 'COINS_MOVED';
      from: number | 'bank';
      /** 'bank' は建設の支払い */
      to: number | 'bank';
      amount: number;
      cardId?: FacilityId | LandmarkId;
      /** 建設のときに0コインだったのでもらった1コイン */
      support?: true;
    }
  | { type: 'CARDS_SWAPPED'; a: number; b: number; aCard: FacilityId; bCard: FacilityId }
  | { type: 'BUILT'; playerId: number; id: FacilityId | LandmarkId }
  | { type: 'LANDMARK_COMPLETED'; playerId: number; id: LandmarkId }
  | { type: 'EXTRA_TURN'; playerId: number }
  | { type: 'TURN_STARTED'; playerId: number }
  | { type: 'GAME_WON'; playerId: number };

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}

export type Rng = () => number;

export interface SeatConfig {
  name: string;
  isHuman: boolean;
  /** オンライン対戦のみ：この席を操作する端末の ID */
  owner?: string;
}

export interface GameConfig {
  seats: SeatConfig[];
}
