import { memo, type CSSProperties } from "react";
import { enabledEffects, getBackground } from "../backgrounds";
import type { Preferences } from "../types";

const petals = [
  {
    left: 38,
    top: -8,
    drift: -64,
    fall: 92,
    seconds: 62,
    delay: -12,
    size: 18,
    turn: 140,
  },
  {
    left: 64,
    top: -6,
    drift: -76,
    fall: 96,
    seconds: 73,
    delay: -39,
    size: 15,
    turn: -110,
  },
  {
    left: 87,
    top: -7,
    drift: -84,
    fall: 103,
    seconds: 68,
    delay: -54,
    size: 17,
    turn: 180,
  },
  {
    left: 104,
    top: 8,
    drift: -105,
    fall: 78,
    seconds: 79,
    delay: -25,
    size: 20,
    turn: -140,
  },
  {
    left: 106,
    top: 29,
    drift: -113,
    fall: 64,
    seconds: 83,
    delay: -63,
    size: 16,
    turn: 120,
  },
  {
    left: 103,
    top: 45,
    drift: -110,
    fall: 55,
    seconds: 88,
    delay: -8,
    size: 21,
    turn: -170,
  },
  {
    left: 51,
    top: -5,
    drift: -68,
    fall: 98,
    seconds: 70,
    delay: -48,
    size: 16,
    turn: -120,
  },
  {
    left: 75,
    top: -8,
    drift: -86,
    fall: 106,
    seconds: 77,
    delay: -18,
    size: 19,
    turn: 150,
  },
  {
    left: 98,
    top: -4,
    drift: -98,
    fall: 90,
    seconds: 81,
    delay: -68,
    size: 15,
    turn: -160,
  },
  {
    left: 105,
    top: 18,
    drift: -112,
    fall: 70,
    seconds: 74,
    delay: -43,
    size: 18,
    turn: 110,
  },
  {
    left: 104,
    top: 37,
    drift: -111,
    fall: 62,
    seconds: 86,
    delay: -31,
    size: 20,
    turn: -130,
  },
  {
    left: 103,
    top: 57,
    drift: -109,
    fall: 46,
    seconds: 92,
    delay: -73,
    size: 17,
    turn: 170,
  },
];

const snowflakes = Array.from({ length: 24 }, (_, i) => ({
  left: 3 + ((i * 37) % 108),
  size: 3 + (i % 4),
  seconds: 36 + (i % 9) * 3,
  delay: -((i * 17) % 57),
  drift: -12 - (i % 5) * 4,
}));
const fireflies = [
  { left: 13, top: 48, seconds: 17, delay: -4 },
  { left: 20, top: 46, seconds: 23, delay: -15 },
  { left: 30, top: 49, seconds: 19, delay: -8 },
  { left: 67, top: 47, seconds: 26, delay: -20 },
  { left: 75, top: 48, seconds: 21, delay: -12 },
  { left: 88, top: 46, seconds: 29, delay: -3 },
];

export const BackgroundScene = memo(function BackgroundScene({
  prefs,
}: {
  prefs: Preferences;
}) {
  const scene = getBackground(prefs.scene);
  if (scene.id === "none" || prefs.backgroundOpacity <= 0) return null;
  const active = new Set(enabledEffects(prefs));
  const stageEffects = [...active].some(
    (key) => key !== "petals" && key !== "leaves" && key !== "snow",
  );
  const wind = active.has("petals") || active.has("leaves");
  const leaves = active.has("leaves");
  return (
    <div
      className={"background-art background-" + scene.id}
      style={{ opacity: prefs.backgroundOpacity }}
      aria-hidden="true"
    >
      <div className={scene.image ? "lake-stage" : "still-stage"}>
        <div
          className="background-still"
          style={
            scene.image
              ? { backgroundImage: 'url("' + scene.image + '")' }
              : undefined
          }
        />
        {stageEffects && (
          <div className="ambient-effects">
            {active.has("mist") && (
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
            {active.has("mountainFog") && (
              <>
                <img
                  className="ambient-layer mountain-fog fog-west"
                  src="/ambient/mist.svg"
                  alt=""
                  draggable="false"
                />
                <img
                  className="ambient-layer mountain-fog fog-east"
                  src="/ambient/mist.svg"
                  alt=""
                  draggable="false"
                />
              </>
            )}
            {active.has("ripples") &&
              ["near", "middle", "far"].map((position) => (
                <img
                  key={position}
                  className={"ambient-layer lake-ripple ripple-" + position}
                  src="/ambient/ripples.svg"
                  alt=""
                  draggable="false"
                />
              ))}
            {active.has("cabinLights") && (
              <div className="ambient-layer cabin-light" />
            )}
            {active.has("moonCloud") && (
              <img
                className="ambient-layer moon-cloud"
                src="/ambient/cloud.svg"
                alt=""
                draggable="false"
              />
            )}
            {active.has("skyClouds") && (
              <>
                <img
                  className="ambient-layer sky-cloud sky-cloud-high"
                  src="/ambient/day-cloud.svg"
                  alt=""
                  draggable="false"
                />
                <img
                  className="ambient-layer sky-cloud sky-cloud-low"
                  src="/ambient/day-cloud.svg"
                  alt=""
                  draggable="false"
                />
              </>
            )}
            {active.has("fireflies") &&
              fireflies.map((fly, i) => (
                <span
                  key={i}
                  className="ambient-layer ambient-firefly"
                  style={{
                    left: fly.left + "%",
                    top: fly.top + "%",
                    animationDuration: fly.seconds + "s",
                    animationDelay: fly.delay + "s",
                  }}
                />
              ))}
          </div>
        )}
      </div>
      {wind && (
        <div className="ambient-effects petal-field">
          {petals.map((petal, i) => (
            <img
              key={i}
              className={
                "ambient-layer " + (leaves ? "ambient-leaf" : "ambient-petal")
              }
              src={leaves ? "/ambient/leaf.svg" : "/ambient/petal.svg"}
              alt=""
              draggable="false"
              style={
                {
                  left: petal.left + "%",
                  top: petal.top + "%",
                  width: petal.size + (leaves ? 5 : 0) + "px",
                  "--petal-drift": petal.drift + "vw",
                  "--petal-fall": petal.fall + "vh",
                  "--petal-turn": petal.turn + "deg",
                  animationDuration: petal.seconds + "s",
                  animationDelay: petal.delay + "s",
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      {active.has("snow") && (
        <div className="ambient-effects snow-field">
          {snowflakes.map((flake, i) => (
            <span
              key={i}
              className="ambient-layer ambient-snow"
              style={
                {
                  left: flake.left + "%",
                  width: flake.size + "px",
                  height: flake.size + "px",
                  "--snow-drift": flake.drift + "vw",
                  animationDuration: flake.seconds + "s",
                  animationDelay: flake.delay + "s",
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
});
