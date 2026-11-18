// ゲームのルール本体。UI に依存しない純粋関数だけを置く。
// 外から見ると「状態とアクションを渡すと、新しい状態とイベントが返る」だけ。
// 内部では入力のコピーを書き換えている（入力の state は変更しない）。

import { FACILITIES, FACILITY_IDS, LANDMARKS, MALL_ICONS, isFacilityId, isLandmarkId } from './cards';
import { rollDie } from './rng';
import type {
  Action,
  ActionResult,
  FacilityId,
  GameEvent,
  GameState,
  LandmarkId,
  Player,
  Rng,
} from './types';

const MAX_LOG = 200;

interface Ctx {
  s: GameState;
  ev: GameEvent[];
}

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function log(ctx: Ctx, text: string): void {
  ctx.s.log.push({ turn: ctx.s.turn, text });
  if (ctx.s.log.length > MAX_LOG) ctx.s.log.splice(0, ctx.s.log.length - MAX_LOG);
}

function sum(dice: number[]): number {
  return dice.reduce((a, b) => a + b, 0);
}

function cardName(id: FacilityId | LandmarkId): string {
  return isLandmarkId(id) ? LANDMARKS[id].name : FACILITIES[id].name;
}

function iconCount(p: Player, icons: string[]): number {
  return FACILITY_IDS.filter((id) => icons.includes(FACILITIES[id].icon)).reduce(
    (n, id) => n + p.cards[id],
    0,
  );
}

/** 銀行から受け取る */
function payFromBank(ctx: Ctx, to: number, amount: number, cardId: FacilityId): void {
  if (amount <= 0) return;
  ctx.s.players[to].coins += amount;
  ctx.ev.push({ type: 'COINS_MOVED', from: 'bank', to, amount, cardId });
}

/** プレイヤー間の移動。足りなければある分だけ。実際に動いた額を返す */
function transfer(ctx: Ctx, from: number, to: number, amount: number, cardId: FacilityId): number {
  const actual = Math.min(amount, ctx.s.players[from].coins);
  if (actual <= 0) return 0;
  ctx.s.players[from].coins -= actual;
  ctx.s.players[to].coins += actual;
  ctx.ev.push({ type: 'COINS_MOVED', from, to, amount: actual, cardId });
  return actual;
}

/** 紫以外の施設を1枚以上持っているか */
export function swappableCards(p: Player): FacilityId[] {
  return FACILITY_IDS.filter((id) => FACILITIES[id].color !== 'purple' && p.cards[id] > 0);
}

// ---------------------------------------------------------------------------
// サイコロ

function doRoll(ctx: Ctx, count: number, rng: Rng): void {
  const s = ctx.s;
  s.dice = Array.from({ length: count }, () => rollDie(rng));
  ctx.ev.push({ type: 'DICE_ROLLED', playerId: s.current, dice: [...s.dice] });
  const p = s.players[s.current];
  log(ctx, `${p.name}が${s.dice.join('+')}${count === 2 ? `=${sum(s.dice)}` : ''}を出した`);
}

function afterRoll(ctx: Ctx): void {
  const s = ctx.s;
  if (s.players[s.current].landmarks.tower && !s.rerollUsed) {
    s.phase = 'rolled';
  } else {
    resolveIncomeInner(ctx);
  }
}

// ---------------------------------------------------------------------------
// 収入処理（赤 → 青・緑 → 紫）

function resolveIncomeInner(ctx: Ctx): void {
  const s = ctx.s;
  s.phase = 'resolving';
  const roll = sum(s.dice);
  const active = s.current;
  const n = s.players.length;

  // ① 赤：active から見て手番の逆順
  for (let i = 1; i < n; i++) {
    const owner = (active - i + n) % n;
    const p = s.players[owner];
    for (const id of FACILITY_IDS) {
      const def = FACILITIES[id];
      if (def.color !== 'red' || p.cards[id] === 0 || !def.rolls.includes(roll)) continue;
      ctx.ev.push({ type: 'CARD_TRIGGERED', playerId: owner, cardId: id });
      const per = def.income + (p.landmarks.mall && MALL_ICONS.includes(def.icon) ? 1 : 0);
      const got = transfer(ctx, active, owner, per * p.cards[id], id);
      if (got > 0) log(ctx, `${p.name}の${def.name}：${s.players[active].name}から${got}コイン`);
    }
  }

  // ② 青（全員）・緑（active のみ）。active から手番順に処理
  for (let i = 0; i < n; i++) {
    const owner = (active + i) % n;
    const p = s.players[owner];
    for (const id of FACILITY_IDS) {
      const def = FACILITIES[id];
      if (p.cards[id] === 0 || !def.rolls.includes(roll)) continue;
      if (def.color === 'blue' || (def.color === 'green' && owner === active)) {
        ctx.ev.push({ type: 'CARD_TRIGGERED', playerId: owner, cardId: id });
        let amount: number;
        if (def.multiplierIcons) {
          amount = p.cards[id] * def.income * iconCount(p, def.multiplierIcons);
        } else {
          const per = def.income + (p.landmarks.mall && MALL_ICONS.includes(def.icon) ? 1 : 0);
          amount = p.cards[id] * per;
        }
        payFromBank(ctx, owner, amount, id);
        if (amount > 0) log(ctx, `${p.name}の${def.name}：+${amount}コイン`);
      }
    }
  }

  // ③ 紫
  runPurple(ctx, 'stadium');
}

type PurpleStage = 'stadium' | 'tv' | 'business';
const PURPLE_STAGES: PurpleStage[] = ['stadium', 'tv', 'business'];

function runPurple(ctx: Ctx, from: PurpleStage): void {
  const s = ctx.s;
  const active = s.current;
  const p = s.players[active];
  const roll = sum(s.dice);
  const n = s.players.length;
  const others = Array.from({ length: n - 1 }, (_, i) => (active + 1 + i) % n);

  for (const stage of PURPLE_STAGES.slice(PURPLE_STAGES.indexOf(from))) {
    const def = FACILITIES[stage];
    if (p.cards[stage] === 0 || !def.rolls.includes(roll)) continue;

    if (stage === 'stadium') {
      ctx.ev.push({ type: 'CARD_TRIGGERED', playerId: active, cardId: 'stadium' });
      let total = 0;
      for (const o of others) total += transfer(ctx, o, active, def.income, 'stadium');
      log(ctx, `${p.name}のスタジアム：合計${total}コイン`);
    } else if (stage === 'tv') {
      ctx.ev.push({ type: 'CARD_TRIGGERED', playerId: active, cardId: 'tv' });
      if (others.length === 1) {
        doTv(ctx, others[0]);
      } else {
        s.pendingChoice = { type: 'tv', playerId: active };
        return;
      }
    } else {
      ctx.ev.push({ type: 'CARD_TRIGGERED', playerId: active, cardId: 'business' });
      const canSwap =
        swappableCards(p).length > 0 && others.some((o) => swappableCards(s.players[o]).length > 0);
      if (canSwap) {
        s.pendingChoice = { type: 'business', playerId: active };
        return;
      }
      log(ctx, `${p.name}のビジネスセンター：交換できる施設がないのでスキップ`);
    }
  }

  delete s.pendingChoice;
  enterBuild(ctx);
}

/** 建設フェーズへ。このとき0コインなら、銀行から1コインもらう */
function enterBuild(ctx: Ctx): void {
  const s = ctx.s;
  s.phase = 'build';
  const p = s.players[s.current];
  if (p.coins === 0) {
    p.coins = 1;
    ctx.ev.push({ type: 'COINS_MOVED', from: 'bank', to: p.id, amount: 1, support: true });
    log(ctx, `${p.name}は0コインなので1コインもらった`);
  }
}

function doTv(ctx: Ctx, target: number): void {
  const s = ctx.s;
  const got = transfer(ctx, target, s.current, FACILITIES.tv.income, 'tv');
  log(ctx, `${s.players[s.current].name}のテレビ局：${s.players[target].name}から${got}コイン`);
}

// ---------------------------------------------------------------------------
// 建設・手番終了

export function getBuildOptions(state: GameState): (FacilityId | LandmarkId)[] {
  if (state.phase !== 'build') return [];
  const p = state.players[state.current];
  const options: (FacilityId | LandmarkId)[] = [];
  for (const id of FACILITY_IDS) if (canBuyFacility(state, p, id)) options.push(id);
  for (const id of Object.keys(LANDMARKS) as LandmarkId[]) {
    if (!p.landmarks[id] && p.coins >= LANDMARKS[id].cost) options.push(id);
  }
  return options;
}

function canBuyFacility(state: GameState, p: Player, id: FacilityId): boolean {
  const def = FACILITIES[id];
  if (state.supply[id] <= 0 || p.coins < def.cost) return false;
  if (def.color === 'purple' && p.cards[id] > 0) return false;
  return true;
}

function doBuild(ctx: Ctx, id: FacilityId | LandmarkId | null): void {
  const s = ctx.s;
  const active = s.current;
  const p = s.players[active];

  if (id === null) {
    log(ctx, `${p.name}は何も買わなかった`);
  } else if (isLandmarkId(id)) {
    const cost = LANDMARKS[id].cost;
    p.coins -= cost;
    p.landmarks[id] = true;
    ctx.ev.push({ type: 'COINS_MOVED', from: active, to: 'bank', amount: cost, cardId: id });
    ctx.ev.push({ type: 'BUILT', playerId: active, id });
    ctx.ev.push({ type: 'LANDMARK_COMPLETED', playerId: active, id });
    log(ctx, `${p.name}が${LANDMARKS[id].name}を完成させた`);
    if (Object.values(p.landmarks).every(Boolean)) {
      s.phase = 'gameOver';
      s.winner = active;
      ctx.ev.push({ type: 'GAME_WON', playerId: active });
      log(ctx, `${p.name}の勝ち！`);
      return;
    }
  } else {
    const cost = FACILITIES[id].cost;
    p.coins -= cost;
    p.cards[id] += 1;
    s.supply[id] -= 1;
    ctx.ev.push({ type: 'COINS_MOVED', from: active, to: 'bank', amount: cost, cardId: id });
    ctx.ev.push({ type: 'BUILT', playerId: active, id });
    log(ctx, `${p.name}が${cardName(id)}を建てた`);
  }

  // この手番で建てた遊園地は、この手番のゾロ目には効かない（振ったときに持っていたかで決める）
  endTurn(ctx, id === 'park');
}

function endTurn(ctx: Ctx, parkBuiltNow: boolean): void {
  const s = ctx.s;
  const p = s.players[s.current];
  if (p.landmarks.park && !parkBuiltNow && s.dice.length === 2 && s.dice[0] === s.dice[1]) {
    ctx.ev.push({ type: 'EXTRA_TURN', playerId: s.current });
    log(ctx, `ゾロ目！${p.name}はもう1回`);
    startTurn(ctx, s.current);
  } else {
    s.turn += 1;
    startTurn(ctx, (s.current + 1) % s.players.length);
  }
}

function startTurn(ctx: Ctx, playerId: number): void {
  const s = ctx.s;
  s.current = playerId;
  s.phase = 'chooseDice';
  s.rerollUsed = false;
  delete s.pendingChoice;
  ctx.ev.push({ type: 'TURN_STARTED', playerId });
}

// ---------------------------------------------------------------------------
// 入口

export function isValidAction(state: GameState, action: Action): boolean {
  if (state.phase === 'gameOver') return false;
  if (action.playerId !== state.current) return false;
  const p = state.players[state.current];
  const n = state.players.length;
  const isOther = (t: number) => Number.isInteger(t) && t >= 0 && t < n && t !== state.current;

  switch (action.type) {
    case 'CHOOSE_DICE':
      if (state.phase !== 'chooseDice') return false;
      if (action.count === 1) return true;
      return action.count === 2 && p.landmarks.station;
    case 'REROLL':
      return state.phase === 'rolled' && !state.rerollUsed;
    case 'KEEP':
      return state.phase === 'rolled';
    case 'CHOOSE_TARGET':
      return (
        state.phase === 'resolving' &&
        state.pendingChoice?.type === 'tv' &&
        isOther(action.targetId)
      );
    case 'SWAP': {
      if (state.phase !== 'resolving' || state.pendingChoice?.type !== 'business') return false;
      if (!isOther(action.targetId)) return false;
      if (!isFacilityId(action.give) || !isFacilityId(action.take)) return false;
      const target = state.players[action.targetId];
      return swappableCards(p).includes(action.give) && swappableCards(target).includes(action.take);
    }
    case 'SKIP_SWAP':
      return state.phase === 'resolving' && state.pendingChoice?.type === 'business';
    case 'BUILD':
      if (state.phase !== 'build') return false;
      return action.id === null || getBuildOptions(state).includes(action.id);
    default:
      return false;
  }
}

/** すべての操作（人間・CPU・将来のオンライン相手）はここを通る。不正な操作は例外を投げる */
export function applyAction(state: GameState, action: Action, rng: Rng): ActionResult {
  if (!isValidAction(state, action)) {
    throw new Error(`不正なアクション: ${JSON.stringify(action)}（phase=${state.phase}）`);
  }
  const ctx: Ctx = { s: cloneState(state), ev: [] };
  const s = ctx.s;

  switch (action.type) {
    case 'CHOOSE_DICE':
      doRoll(ctx, action.count, rng);
      afterRoll(ctx);
      break;
    case 'REROLL':
      s.rerollUsed = true;
      log(ctx, `${s.players[s.current].name}は振り直した`);
      doRoll(ctx, s.dice.length, rng);
      resolveIncomeInner(ctx);
      break;
    case 'KEEP':
      resolveIncomeInner(ctx);
      break;
    case 'CHOOSE_TARGET':
      doTv(ctx, action.targetId);
      delete s.pendingChoice;
      runPurple(ctx, 'business');
      break;
    case 'SWAP': {
      const me = s.players[s.current];
      const target = s.players[action.targetId];
      me.cards[action.give] -= 1;
      target.cards[action.give] += 1;
      target.cards[action.take] -= 1;
      me.cards[action.take] += 1;
      ctx.ev.push({
        type: 'CARDS_SWAPPED',
        a: s.current,
        b: action.targetId,
        aCard: action.give,
        bCard: action.take,
      });
      log(
        ctx,
        `${me.name}が${target.name}と交換：${cardName(action.give)} ⇄ ${cardName(action.take)}`,
      );
      delete s.pendingChoice;
      enterBuild(ctx);
      break;
    }
    case 'SKIP_SWAP':
      log(ctx, `${s.players[s.current].name}は交換しなかった`);
      delete s.pendingChoice;
      enterBuild(ctx);
      break;
    case 'BUILD':
      doBuild(ctx, action.id);
      break;
  }

  return { state: s, events: ctx.ev };
}

// ---------------------------------------------------------------------------
// 8章の関数名に対応する薄いラッパー（中身は applyAction と同じ処理）

/** サイコロを振る（電波塔がなければ収入処理まで進む） */
export function rollDice(state: GameState, count: 1 | 2, rng: Rng): ActionResult {
  return applyAction(state, { type: 'CHOOSE_DICE', playerId: state.current, count }, rng);
}

/** 電波塔で振り直す */
export function reroll(state: GameState, rng: Rng): ActionResult {
  return applyAction(state, { type: 'REROLL', playerId: state.current }, rng);
}

/** 振り直さずに収入処理へ進む */
export function resolveIncome(state: GameState): ActionResult {
  return applyAction(state, { type: 'KEEP', playerId: state.current }, () => 0);
}

/** テレビ局・ビジネスセンターの選択を反映する */
export function applyChoice(
  state: GameState,
  choice:
    | { type: 'CHOOSE_TARGET'; targetId: number }
    | { type: 'SWAP'; targetId: number; give: FacilityId; take: FacilityId }
    | { type: 'SKIP_SWAP' },
): ActionResult {
  return applyAction(state, { ...choice, playerId: state.current } as Action, () => 0);
}

/** 購入して手番を終える（null は何も買わない） */
export function build(state: GameState, id: FacilityId | LandmarkId | null): ActionResult {
  return applyAction(state, { type: 'BUILD', playerId: state.current, id }, () => 0);
}
