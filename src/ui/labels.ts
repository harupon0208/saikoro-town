// 画面表示用の短い文言（ゲームのルールには関係しない）
import { FACILITIES, FACILITY_IDS } from '../game/cards';
import type { Color, FacilityId, Player } from '../game/types';

export const COLOR_LEGEND: { color: Color; label: string }[] = [
  { color: 'blue', label: 'いつでも' },
  { color: 'green', label: '自分' },
  { color: 'red', label: '相手' },
  { color: 'purple', label: '大型' },
];

export const COLOR_NAMES: Record<Color, string> = {
  blue: '青',
  green: '緑',
  red: '赤',
  purple: '紫',
};

/** 工場・市場が数えるカードの名前（例: 「森・鉱山」） */
export function multiplierNames(id: FacilityId): string {
  const icons = FACILITIES[id].multiplierIcons ?? [];
  return FACILITY_IDS.filter((f) => icons.includes(FACILITIES[f].icon))
    .map((f) => FACILITIES[f].name)
    .join('・');
}

/** カードに書く短い効果（例: 「銀行から1」「牧場×3」） */
export function shortEffect(id: FacilityId): string {
  const c = FACILITIES[id];
  if (id === 'stadium') return `全員から${c.income}`;
  if (id === 'tv') return `1人から${c.income}`;
  if (id === 'business') return '施設を交換';
  if (c.multiplierIcons) return `${multiplierNames(id)}×${c.income}`;
  if (c.color === 'red') return `振った人から${c.income}`;
  return `銀行から${c.income}`;
}

export function rollsLabel(id: FacilityId): string {
  const r = FACILITIES[id].rolls;
  return r.length > 1 ? `${r[0]}–${r[r.length - 1]}` : String(r[0]);
}

/** 工場・市場の収入の内訳（例: 「牧場3 × 3 = +9」）。それ以外は null */
export function incomeFormula(p: Player, id: FacilityId, amount: number): string | null {
  const c = FACILITIES[id];
  if (!c.multiplierIcons) return null;
  const n = FACILITY_IDS.filter((f) => c.multiplierIcons!.includes(FACILITIES[f].icon)).reduce(
    (sum, f) => sum + p.cards[f],
    0,
  );
  const copies = p.cards[id] > 1 ? ` × ${p.cards[id]}枚` : '';
  return `${multiplierNames(id)}${n} × ${c.income}${copies} = +${amount}`;
}
