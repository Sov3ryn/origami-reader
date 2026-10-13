import { memo, type CSSProperties } from "react";

const petals = [
  { left: 8, drift: 18, seconds: 57, delay: -14, size: 13, turn: 120 },
  { left: 19, drift: 26, seconds: 69, delay: -42, size: 9, turn: -90 },
  { left: 42, drift: 15, seconds: 73, delay: -60, size: 10, turn: 170 },
  { left: 68, drift: -20, seconds: 65, delay: -26, size: 12, turn: -130 },
  { left: 87, drift: -16, seconds: 61, delay: -49, size: 14, turn: 100 },
  { left: 96, drift: -24, seconds: 79, delay: -5, size: 8, turn: -160 },
];

export const BackgroundScene = memo(function BackgroundScene({
  scene,
  opacity,
  motion,
  mist,
  petals: showPetals,
}: {
  scene: string;
  opacity: number;
  motion: boolean;
  mist: boolean;
  petals: boolean;
}) {
  if (scene === "none" || opacity <= 0) return null;
  const animate = scene === "lake" && motion;
  return (
    <div
      className={"background-art background-" + scene}
      style={{ opacity }}
      aria-hidden="true"
    >
      <div className="background-still" />
      {animate && (mist || showPetals) && (
        <div className="ambient-effects">
          {mist && (
            <>
              <img
                className="ambient-layer ambient-mist mist-near"
                src="/ambient/mist.svg"
                alt=""
                draggable="false"
              />
              <img
                className="ambient-layer ambient-mist mist-far"
                src="/ambient/mist.svg"
                alt=""
                draggable="false"
              />
            </>
          )}
          {showPetals &&
            petals.map((petal, i) => (
              <img
                key={i}
                className="ambient-layer ambient-petal"
                src="/ambient/petal.svg"
                alt=""
                draggable="false"
                style={
                  {
                    left: petal.left + "%",
                    width: petal.size + "px",
                    "--petal-drift": petal.drift + "vw",
                    "--petal-turn": petal.turn + "deg",
                    animationDuration: petal.seconds + "s",
                    animationDelay: petal.delay + "s",
                  } as CSSProperties
                }
              />
            ))}
        </div>
      )}
    </div>
  );
});
