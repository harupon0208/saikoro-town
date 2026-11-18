import { describe, expect, it } from 'vitest';
import { createGame } from '../game/state';
import { parseToGuest, parseToHost } from './protocol';

const state = createGame({ seats: [{ name: 'A', isHuman: true, owner: 'host' }, { name: 'B', isHuman: false }] }, () => 0);

describe('メッセージの確認', () => {
  it('ホストに届くもの：形がおかしいものは捨てる', () => {
    expect(parseToHost({ t: 'hello', clientId: 'x', name: 'アキ' })).toEqual({ t: 'hello', clientId: 'x', name: 'アキ' });
    expect(parseToHost({ t: 'action', action: { type: 'KEEP', playerId: 1 } })).not.toBeNull();
    expect(parseToHost({ t: 'action', action: { type: 'CHEAT', playerId: 1 } })).toBeNull();
    expect(parseToHost({ t: 'action', action: { type: 'KEEP' } })).toBeNull();
    expect(parseToHost({ t: 'hello', clientId: 3 })).toBeNull();
    expect(parseToHost('hello')).toBeNull();
    expect(parseToHost(null)).toBeNull();
  });

  it('友達に届くもの：状態は GameState の形か確かめる', () => {
    const ok = parseToGuest(JSON.parse(JSON.stringify({ t: 'state', state, events: [], offline: [] })));
    expect(ok?.t).toBe('state');
    expect(parseToGuest({ t: 'state', state: { ...state, players: 'x' }, events: [], offline: [] })).toBeNull();
    expect(parseToGuest({ t: 'room', code: '1234', members: [{ name: 'A', connected: true }], count: 3 })).not.toBeNull();
    expect(parseToGuest({ t: 'pick', pick: null })).toEqual({ t: 'pick', pick: null });
    expect(parseToGuest({ t: 'nope' })).toBeNull();
  });
});
