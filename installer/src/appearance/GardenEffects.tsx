// Synced by scripts/sync-appearance.mjs from the reader's visual components.
import type { BackgroundEffect } from "../../../src/backgrounds";
import type { CSSProperties } from "react";

// Effects share the artwork's coordinate system, including when it is cropped.
export function GardenEffects({
  active,
  night,
}: {
  active: Set<BackgroundEffect>;
  night: boolean;
}) {
  return (
    <div className="ambient-effects garden-effects">
      {active.has("mist") && (
        <>
          <img
            className="garden-mist garden-mist-back"
            src="/ambient/mist.svg"
            alt=""
          />
          <img
            className="garden-mist garden-mist-front"
            src="/ambient/mist.svg"
            alt=""
          />
        </>
      )}
      {active.has("skyClouds") && (
        <img className="garden-cloud" src="/ambient/cloud.svg" alt="" />
      )}
      {active.has("gardenShadows") && <div className="garden-shadow" />}
      {active.has("cabinLights") && night && <div className="garden-lantern" />}
      {active.has("fireflies") &&
        Array.from({ length: 14 }, (_, i) => (
          <i
            key={i}
            className="garden-firefly"
            style={
              {
                left: `${17 + ((i * 19) % 72)}%`,
                top: `${47 + ((i * 7) % 17)}%`,
                animationDelay: `${-i * 2.7}s`,
                animationDuration: `${17 + (i % 7)}s`,
              } as CSSProperties
            }
          />
        ))}
      {active.has("fountain") && (
        <svg className="garden-fountain" viewBox="0 0 240 180" fill="none">
          <defs>
            <linearGradient id="garden-bamboo" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#989176" />
              <stop offset=".5" stopColor="#616448" />
              <stop offset="1" stopColor="#353d2d" />
            </linearGradient>
          </defs>
          <path
            d="M70 120 L70 40 M84 120 L84 42"
            stroke="#545838"
            strokeWidth="7"
          />
          <g className="bamboo-tipper">
            <path
              d="M28 44 L133 63"
              stroke="#252b20"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <path
              d="M28 42 L133 61"
              stroke="url(#garden-bamboo)"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <path
              d="M45 39 L43 49 M105 50 L103 60"
              stroke="#505736"
              strokeWidth="2"
            />
            <ellipse cx="132" cy="60" rx="5" ry="3.5" fill="#252b20" />
          </g>
          <path
            className="basin-pour"
            d="M131 85 Q140 105 133 134"
            stroke="#d4e1e0"
            strokeWidth="1.6"
          />
          <ellipse
            className="basin-ring ring-one"
            cx="128"
            cy="138"
            rx="25"
            ry="4"
            stroke="#c3d1c5"
          />
          <ellipse
            className="basin-ring ring-two"
            cx="128"
            cy="138"
            rx="25"
            ry="4"
            stroke="#c3d1c5"
          />
        </svg>
      )}
    </div>
  );
}
