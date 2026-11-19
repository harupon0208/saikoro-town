// サイコロタウンの型定義。GameState はすべて JSON に変換できる形にする（関数・クラスを入れない）。

export type Color = 'blue' | 'green' | 'red' | 'purple';
export type Icon = 'wheat' | 'cow' | 'gear' | 'shop' | 'cup' | 'factory' | 'fruit' | 'major' | 'boat';

/** 拡張。'harbor' = 港の拡張 */
export type Expansion = 'harbor';

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
  | 'market'
  // 港の拡張
  | 'sushi'
  | 'flower'
  | 'flowerShop'
  | 'mackerel'
  | 'tuna'
  | 'warehouse'
  | 'pizza'
  | 'burger'
  | 'publisher'
  | 'tax';

export type LandmarkId = 'station' | 'mall' | 'park' | 'tower' | 'harbor' | 'airport';

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
  /** 花屋：このカードの枚数 × income を受け取る */
  multiplierCards?: FacilityId[];
  /** このランドマークを持っていないと発動しない（港の拡張の寿司屋・漁船） */
  requires?: LandmarkId;
  /** どの拡張のカードか（基本セットは undefined） */
  expansion?: Expansion;
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
  expansion?: Expansion;
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
  /** すべての施設の枚数（このゲームで使わない施設も 0 で入っている） */
  cards: Record<FacilityId, number>;
  /** このゲームで使うランドマークだけが入っている（基本は4つ、港の拡張は6つ）。全部建てたら勝ち */
  landmarks: Partial<Record<LandmarkId, boolean>>;
}

/** harbor = 港で「+2するか」を選ぶ */
export type Phase = 'chooseDice' | 'rolled' | 'harbor' | 'tuna' | 'resolving' | 'build' | 'gameOver';

export type PendingChoice =
  | { type: 'tv'; playerId: number }
  | { type: 'business'; playerId: number };

export interface LogEntry {
  turn: number;
  text: string;
}

export interface MarketRefill {
  /** 補充した手番の通し番号 */
  turn: number;
  /** 新しく並んだ種類 */
  newKinds: FacilityId[];
  /** 今ある山に重ねた種類 */
  restocked: FacilityId[];
}

/** 遊び方の設定。market: 'all' = 全種類を並べる / 'ten' = 山札から10種類だけ並べる */
export interface GameOptions {
  expansions: Expansion[];
  market: 'all' | 'ten';
}

export interface GameState {
  players: Player[];
  /** 市場に並んでいる枚数 */
  supply: Record<FacilityId, number>;
  /** 遊び方（古い保存データにはない＝基本セット・全種類） */
  options?: GameOptions;
  /** 市場の山札（10種類だけ並べるとき。先頭から引く） */
  deck?: FacilityId[];
  /** 港で合計に2を足した */
  harborBonus?: boolean;
  /** マグロ漁船で手番の人が振ったサイコロ2個（その手番のあいだ残す） */
  tunaDice?: number[];
  /** 最後に市場へ補充したカード（10種類の市場）。turn から一周するまで画面で「NEW」「補充」を出す */
  refill?: MarketRefill;
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
  /** 港：合計に2を足すか */
  | { type: 'HARBOR'; playerId: number; add: boolean }
  /** マグロ漁船：手番の人がサイコロ2個を振る */
  | { type: 'TUNA'; playerId: number }
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
      /** 建設のときに0コインだったのでもらった1コイン（空港の10コインは cardId: 'airport'） */
      support?: true;
    }
  | { type: 'CARDS_SWAPPED'; a: number; b: number; aCard: FacilityId; bCard: FacilityId }
  | { type: 'BUILT'; playerId: number; id: FacilityId | LandmarkId }
  | { type: 'LANDMARK_COMPLETED'; playerId: number; id: LandmarkId }
  | { type: 'EXTRA_TURN'; playerId: number }
  /** 港で合計に2を足した */
  | { type: 'HARBOR_ADDED'; playerId: number }
  /** マグロ漁船：手番の人がサイコロ2個を振った */
  | { type: 'TUNA_ROLLED'; playerId: number; dice: number[] }
  /** 市場の山が売り切れたので、山札から引いて並べた（引いた順） */
  | { type: 'MARKET_REFILLED'; cards: FacilityId[]; newKinds: FacilityId[]; restocked: FacilityId[] }
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
  /** 省略すると基本セット・全種類 */
  options?: GameOptions;
}
