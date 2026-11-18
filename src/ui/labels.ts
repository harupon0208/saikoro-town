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
  const c = FACILITIES[id];
  if (c.multiplierCards) return c.multiplierCards.map((f) => FACILITIES[f].name).join('・');
  if (c.multiplierIcons?.includes('cup')) return '☕';
  const icons = c.multiplierIcons ?? [];
  return FACILITY_IDS.filter((f) => icons.includes(FACILITIES[f].icon) && !FACILITIES[f].expansion)
    .map((f) => FACILITIES[f].name)
    .join('・');
}

/** 数えるカードの枚数（工場・市場・花屋など） */
function multiplierCount(p: Player, id: FacilityId): number {
  const c = FACILITIES[id];
  if (c.multiplierCards) return c.multiplierCards.reduce((n, f) => n + p.cards[f], 0);
  const icons = c.multiplierIcons ?? [];
  return FACILITY_IDS.filter((f) => icons.includes(FACILITIES[f].icon)).reduce((n, f) => n + p.cards[f], 0);
}

/** カードに書く短い効果（例: 「銀行から1」「牧場×3」） */
export function shortEffect(id: FacilityId): string {
  const c = FACILITIES[id];
  if (id === 'stadium') return `全員から${c.income}`;
  if (id === 'tv') return `1人から${c.income}`;
  if (id === 'business') return '施設を交換';
  if (id === 'publisher') return '☕🏪×1ずつ';
  if (id === 'tax') return '10以上から半分';
  if (id === 'tuna') return '⚓ 2個振った数';
  const harbor = c.requires === 'harbor' ? '⚓ ' : '';
  if (c.multiplierIcons || c.multiplierCards) return `${multiplierNames(id)}×${c.income}`;
  if (c.color === 'red') return `${harbor}振った人から${c.income}`;
  return `${harbor}銀行から${c.income}`;
}

export function rollsLabel(id: FacilityId): string {
  const r = FACILITIES[id].rolls;
  return r.length > 1 ? `${r[0]}–${r[r.length - 1]}` : String(r[0]);
}

/** 工場・市場の収入の内訳（例: 「牧場3 × 3 = +9」）。それ以外は null */
export function incomeFormula(p: Player, id: FacilityId, amount: number): string | null {
  const c = FACILITIES[id];
  if (!c.multiplierIcons && !c.multiplierCards) return null;
  const n = multiplierCount(p, id);
  const copies = p.cards[id] > 1 ? ` × ${p.cards[id]}枚` : '';
  return `${multiplierNames(id)}${n} × ${c.income}${copies} = +${amount}`;
}
