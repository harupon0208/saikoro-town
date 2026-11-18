import { useState } from 'react';
import { FACILITIES, LANDMARKS, isLandmarkId } from '../../game/cards';
import type { FacilityId, LandmarkId } from '../../game/types';
import { cardImageUrl } from '../assets';

/**
 * カードの絵。public/cards/<カードID>.png などがあれば画像、なければ（読み込みに失敗したときも）絵文字。
 * 枠の大きさは CSS で固定しているので、どんな縦横比の画像でもカードの形は崩れない。
 */
export function CardArt({ id, className = '' }: { id: FacilityId | LandmarkId; className?: string }) {
  const url = cardImageUrl(id);
  const [failed, setFailed] = useState(false);
  const emoji = isLandmarkId(id) ? LANDMARKS[id].emoji : FACILITIES[id].emoji;

  return (
    <span className={`card-art ${className}`} aria-hidden="true">
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span className="card-emoji">{emoji}</span>
      )}
    </span>
  );
}
