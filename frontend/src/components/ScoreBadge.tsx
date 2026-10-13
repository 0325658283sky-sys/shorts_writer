/** 점수 배지 — 디자인 시스템. 숫자는 모노·tabular, 단위 "점"은 작게. */
export function ScoreBadge({
  score,
  solid = false,
}: {
  score: number;
  /** 플레이어 위처럼 이미지 위에 얹을 때는 채운 앰버. */
  solid?: boolean;
}) {
  return (
    <span className={`ncut-score ${solid ? "is-solid" : ""}`}>
      <span className="ncut-num">{Math.round(score)}</span>
      <span className="ncut-score-unit">점</span>
    </span>
  );
}
