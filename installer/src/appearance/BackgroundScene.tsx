// Synced by scripts/sync-appearance.mjs from the reader's visual components.
import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  backgroundImage,
  counterpart,
  enabledEffects,
  getBackground,
} from "../../../src/backgrounds";
import type { Preferences } from "../../../src/types";
import { GardenEffects } from "./GardenEffects";
import { FishRipples } from "./FishRipples";
import { PlaceBackground } from "./PlaceBackground";

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

const seasonalPetals = [
  ...petals,
  ...petals.map((petal) => ({
    ...petal,
    left: Math.min(110, petal.left + 12),
    top: petal.top + 7,
    delay: petal.delay - 27,
    size: petal.size + 3,
  })),
];
const snowflakes = Array.from({ length: 42 }, (_, i) => ({
  left: 3 + ((i * 37) % 108),
  size: 5 + (i % 4),
  seconds: 36 + (i % 9) * 3,
  delay: -((i * 17) % 57),
  drift: -12 - (i % 5) * 4,
}));
const fireflies = Array.from({ length: 16 }, (_, i) => ({
  left: 12 + ((i * 23) % 83),
  top: 47 + ((i * 11) % 30),
  seconds: 20 + (i % 7) * 2,
  delay: -((i * 7) % 29),
  size: 15 + (i % 4) * 2,
}));

type Art = { url: string; filter?: string } | undefined;
const artStyle = (art: Art): CSSProperties | undefined =>
  art
    ? { backgroundImage: 'url("' + art.url + '")', filter: art.filter }
    : undefined;

export const BackgroundScene = memo(function BackgroundScene({
  prefs,
}: {
  prefs: Preferences;
  // Changes when painted art replaces a draft, so the scene re-renders.
  artVersion?: number;
}) {
  const scene = getBackground(prefs.scene);
  const art = backgroundImage(scene);
  const artKey = art ? art.url + (art.filter || "") : scene.id;
  // Day/night and season changes crossfade from the previous painting.
  const [previous, setPrevious] = useState<Art>(undefined);
  const shown = useRef<{ key: string; art: Art }>({ key: artKey, art });
  useEffect(() => {
    if (shown.current.key === artKey) return;
    setPrevious(shown.current.art);
    shown.current = { key: artKey, art };
    const timer = setTimeout(() => setPrevious(undefined), 1400);
    return () => clearTimeout(timer);
  }, [artKey]);
  // Decode the other half of the day/night pair in advance so the Sun/Moon
  // switch crossfades immediately.
  const twin = counterpart(scene.id);
  const twinArt = twin ? backgroundImage(getBackground(twin)) : undefined;
  useEffect(() => {
    if (!twinArt || typeof Image === "undefined") return;
    const probe = new Image();
    probe.decoding = "async";
    probe.src = twinArt.url;
    void probe.decode?.().catch(() => {});
  }, [twinArt?.url]);
  if (scene.id === "none" || prefs.backgroundOpacity <= 0) return null;
  if (scene.place)
    return (
      <div
        className="background-art background-place"
        style={{ opacity: prefs.backgroundOpacity }}
        aria-hidden="true"
      >
        <PlaceBackground
          place={scene.place}
          motion={prefs.motion}
          fireworks={prefs.fireworks}
        />
      </div>
    );
  const active = new Set(enabledEffects(prefs));
  const stageEffects = [...active].some(
    (key) => key !== "petals" && key !== "leaves" && key !== "snow",
  );
  const wind = active.has("petals") || active.has("leaves");
  const leaves = active.has("leaves");
  return (
    <div
      className={
        "background-art background-" +
        scene.id +
        (scene.time ? " time-" + scene.time : "") +
        (scene.location === "garden" ? " garden-scene" : "")
      }
      style={{ opacity: prefs.backgroundOpacity }}
      aria-hidden="true"
    >
      <div className={scene.image ? "lake-stage" : "still-stage"}>
        <div className="background-still" style={artStyle(art)} />
        {previous && (
          <div
            key={previous.url + (previous.filter || "")}
            className="previous-still"
            style={artStyle(previous)}
          />
        )}
        {scene.location === "garden" && (
          <GardenEffects active={active} night={scene.time === "night"} />
        )}
        {stageEffects && scene.location !== "garden" && (
          <div className="ambient-effects" key={scene.id}>
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
                    width: fly.size + "px",
                    height: fly.size + "px",
                  }}
                />
              ))}
            {active.has("fishRipples") && <FishRipples />}
          </div>
        )}
      </div>
      {wind && (
        <div className="ambient-effects petal-field">
          {(scene.id === "lake" ? petals : seasonalPetals).map((petal, i) => (
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
                  width:
                    petal.size +
                    (leaves ? 7 : scene.id === "spring" ? 3 : 0) +
                    "px",
                  "--petal-drift": petal.drift + "cqw",
                  "--petal-fall": petal.fall + "cqh",
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
                  "--snow-drift": flake.drift + "cqw",
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
