// Online embeds: turns a link someone pastes into the address of the
// service's own embeddable player or post. No network request is made here,
// and nothing loads until the reader has allowed online embeds.

export type EmbedKind = "video" | "audio" | "post" | "map" | "design" | "document" | "code" | "math" | "page";
export type Embed = {
  provider: string;
  kind: EmbedKind;
  src: string;
  // Width / height, or a fixed height in pixels for posts and players.
  ratio?: number;
  height?: number;
};

const u = (text: string): URL | null => {
  try {
    const url = new URL(text.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
};
const host = (url: URL) => url.hostname.replace(/^(www|m|mobile)\./, "");
const seconds = (t: string | null) => {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return +t;
  const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(t);
  return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + +(m[3] || 0) : 0;
};
const enc = encodeURIComponent;

type Rule = { name: string; kind: EmbedKind; match: (url: URL, h: string) => Omit<Embed, "provider" | "kind"> | null };

export const providers: Rule[] = [
  {
    name: "YouTube",
    kind: "video",
    match: (url, h) => {
      let id = "";
      if (h === "youtu.be") id = url.pathname.slice(1).split("/")[0];
      else if (h === "youtube.com" || h === "music.youtube.com" || h === "youtube-nocookie.com") {
        if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
        else id = /^\/(?:shorts|live|embed|v)\/([\w-]{6,})/.exec(url.pathname)?.[1] || "";
        const list = url.searchParams.get("list");
        if (!id && list) return { src: `https://www.youtube-nocookie.com/embed/videoseries?list=${enc(list)}`, ratio: 16 / 9 };
      }
      if (!/^[\w-]{6,}$/.test(id)) return null;
      const start = seconds(url.searchParams.get("t") || url.searchParams.get("start"));
      return { src: `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ""}`, ratio: 16 / 9 };
    },
  },
  {
    name: "Vimeo",
    kind: "video",
    match: (url, h) => {
      const id = h === "vimeo.com" ? /^\/(?:video\/)?(\d+)/.exec(url.pathname)?.[1] : h === "player.vimeo.com" ? /^\/video\/(\d+)/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://player.vimeo.com/video/${id}?dnt=1`, ratio: 16 / 9 } : null;
    },
  },
  {
    name: "Dailymotion",
    kind: "video",
    match: (url, h) => {
      const id = h === "dailymotion.com" ? /^\/video\/(\w+)/.exec(url.pathname)?.[1] : h === "dai.ly" ? url.pathname.slice(1) : null;
      return id ? { src: `https://geo.dailymotion.com/player.html?video=${id}`, ratio: 16 / 9 } : null;
    },
  },
  {
    name: "Loom",
    kind: "video",
    match: (url, h) => {
      const id = h === "loom.com" ? /^\/(?:share|embed)\/(\w+)/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://www.loom.com/embed/${id}`, ratio: 16 / 9 } : null;
    },
  },
  {
    name: "TED",
    kind: "video",
    match: (url, h) => {
      const slug = h === "ted.com" ? /^\/talks\/([\w-]+)/.exec(url.pathname)?.[1] : null;
      return slug ? { src: `https://embed.ted.com/talks/${slug}`, ratio: 16 / 9 } : null;
    },
  },
  {
    name: "Internet Archive",
    kind: "video",
    match: (url, h) => {
      const id = h === "archive.org" ? /^\/(?:details|embed)\/([^/?#]+)/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://archive.org/embed/${id}`, ratio: 4 / 3 } : null;
    },
  },
  {
    name: "Spotify",
    kind: "audio",
    match: (url, h) => {
      const m = h === "open.spotify.com" ? /^\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/.exec(url.pathname) : null;
      return m ? { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === "track" || m[1] === "episode" ? 152 : 380 } : null;
    },
  },
  {
    name: "SoundCloud",
    kind: "audio",
    match: (url, h) =>
      h === "soundcloud.com" && url.pathname.split("/").filter(Boolean).length >= 2
        ? { src: `https://w.soundcloud.com/player/?url=${enc(url.origin + url.pathname)}&visual=false`, height: url.pathname.includes("/sets/") ? 360 : 166 }
        : null,
  },
  {
    name: "Apple Podcasts",
    kind: "audio",
    match: (url, h) => (h === "podcasts.apple.com" ? { src: `https://embed.podcasts.apple.com${url.pathname}${url.search}`, height: url.searchParams.get("i") ? 175 : 450 } : null),
  },
  {
    name: "X (Twitter)",
    kind: "post",
    match: (url, h) => {
      const id = h === "twitter.com" || h === "x.com" ? /^\/\w+\/status\/(\d+)/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`, height: 600 } : null;
    },
  },
  {
    name: "Instagram",
    kind: "post",
    match: (url, h) => {
      const m = h === "instagram.com" ? /^\/(p|reel|tv)\/([\w-]+)/.exec(url.pathname) : null;
      return m ? { src: `https://www.instagram.com/${m[1]}/${m[2]}/embed`, height: 680 } : null;
    },
  },
  {
    name: "TikTok",
    kind: "post",
    match: (url, h) => {
      const id = h === "tiktok.com" ? /\/video\/(\d+)/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://www.tiktok.com/embed/v2/${id}`, height: 740 } : null;
    },
  },
  {
    name: "Reddit",
    kind: "post",
    match: (url, h) =>
      (h === "reddit.com" || h === "old.reddit.com") && /^\/r\/\w+\/comments\/\w+/.test(url.pathname)
        ? { src: `https://embed.reddit.com${url.pathname}?embed=true`, height: 520 }
        : null,
  },
  {
    name: "Threads",
    kind: "post",
    match: (url, h) => {
      const m = h === "threads.net" || h === "threads.com" ? /^\/(@[\w.]+)\/post\/([\w-]+)/.exec(url.pathname) : null;
      return m ? { src: `https://www.threads.net/${m[1]}/post/${m[2]}/embed`, height: 600 } : null;
    },
  },
  {
    name: "LinkedIn",
    kind: "post",
    match: (url, h) => {
      if (h !== "linkedin.com") return null;
      const urn = /urn:li:(?:activity|share|ugcPost):\d+/.exec(decodeURIComponent(url.pathname))?.[0] || (/activity-(\d+)/.exec(url.pathname)?.[1] ? `urn:li:activity:${/activity-(\d+)/.exec(url.pathname)![1]}` : "");
      return urn ? { src: `https://www.linkedin.com/embed/feed/update/${urn}`, height: 600 } : null;
    },
  },
  {
    name: "Facebook",
    kind: "post",
    match: (url, h) => {
      if (h !== "facebook.com" && h !== "fb.watch") return null;
      const video = /\/videos?\/|fb\.watch|\/watch/.test(url.href);
      return { src: `https://www.facebook.com/plugins/${video ? "video" : "post"}.php?href=${enc(url.href)}&show_text=true`, height: video ? 420 : 600 };
    },
  },
  {
    name: "Pinterest",
    kind: "post",
    match: (url, h) => {
      const id = /(^|\.)pinterest\.[a-z.]+$/.test(h) ? /^\/pin\/(\d+)/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://assets.pinterest.com/ext/embed.html?id=${id}`, height: 620 } : null;
    },
  },
  {
    name: "Mastodon",
    kind: "post",
    // Any server: https://server/@name/12345
    match: (url) => (/^\/@[\w.]+(@[\w.-]+)?\/\d{6,}$/.test(url.pathname) ? { src: `${url.origin}${url.pathname}/embed`, height: 420 } : null),
  },
  {
    name: "Google Maps",
    kind: "map",
    match: (url, h) => {
      if (!/^(maps\.)?google\.[a-z.]+$/.test(h) || !(url.pathname.startsWith("/maps") || h.startsWith("maps."))) return null;
      const place = /\/place\/([^/]+)/.exec(url.pathname)?.[1];
      const at = /@(-?\d+\.\d+),(-?\d+\.\d+),(\d+(?:\.\d+)?)z/.exec(url.pathname);
      const q = url.searchParams.get("q") || (place ? decodeURIComponent(place.replace(/\+/g, " ")) : at ? `${at[1]},${at[2]}` : "");
      if (!q) return null;
      const zoom = at ? Math.round(+at[3]) : 14;
      return { src: `https://maps.google.com/maps?q=${enc(q)}&z=${zoom}&output=embed`, ratio: 16 / 10 };
    },
  },
  {
    name: "OpenStreetMap",
    kind: "map",
    match: (url, h) => {
      if (h !== "openstreetmap.org") return null;
      const m = /map=(\d+)\/(-?[\d.]+)\/(-?[\d.]+)/.exec(url.hash || url.search);
      if (!m) return null;
      const [z, lat, lon] = [+m[1], +m[2], +m[3]];
      const span = 360 / 2 ** z;
      const bbox = [lon - span, lat - span / 2, lon + span, lat + span / 2].map((v) => v.toFixed(5)).join(",");
      return { src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`, ratio: 16 / 10 };
    },
  },
  {
    name: "Figma",
    kind: "design",
    match: (url, h) =>
      h === "figma.com" && /^\/(file|design|proto|board|slides)\//.test(url.pathname)
        ? { src: `https://www.figma.com/embed?embed_host=origami&url=${enc(url.href)}`, ratio: 16 / 10 }
        : null,
  },
  {
    name: "Miro",
    kind: "design",
    match: (url, h) => {
      const id = h === "miro.com" ? /^\/app\/board\/([^/]+)/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://miro.com/app/live-embed/${id}/`, ratio: 16 / 10 } : null;
    },
  },
  {
    name: "Canva",
    kind: "design",
    match: (url, h) => {
      const id = h === "canva.com" ? /^\/design\/([\w-]+)\/[\w-]+\/view/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://www.canva.com${url.pathname}?embed`, ratio: 16 / 9 } : null;
    },
  },
  {
    name: "Sketchfab",
    kind: "design",
    match: (url, h) => {
      const id = h === "sketchfab.com" ? /(?:-|\/models\/)([0-9a-f]{32})/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://sketchfab.com/models/${id}/embed`, ratio: 16 / 10 } : null;
    },
  },
  {
    name: "Google Docs",
    kind: "document",
    match: (url, h) => {
      if (h === "drive.google.com") {
        const id = /^\/file\/d\/([\w-]+)/.exec(url.pathname)?.[1];
        return id ? { src: `https://drive.google.com/file/d/${id}/preview`, ratio: 4 / 3 } : null;
      }
      if (h !== "docs.google.com") return null;
      const m = /^\/(document|spreadsheets|presentation|forms)\/d\/(e\/)?([\w-]+)/.exec(url.pathname);
      if (!m) return null;
      const base = `https://docs.google.com/${m[1]}/d/${m[2] || ""}${m[3]}`;
      const tail = m[1] === "presentation" ? "/embed" : m[1] === "forms" ? "/viewform?embedded=true" : m[2] ? "/pubhtml?widget=true" : "/preview";
      return { src: base + tail, ratio: m[1] === "presentation" ? 16 / 9 : 4 / 3 };
    },
  },
  {
    name: "CodePen",
    kind: "code",
    match: (url, h) => {
      const m = h === "codepen.io" ? /^\/([\w-]+)\/(?:pen|full|embed)\/(\w+)/.exec(url.pathname) : null;
      return m ? { src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result`, height: 420 } : null;
    },
  },
  {
    name: "CodeSandbox",
    kind: "code",
    match: (url, h) => {
      const id = h === "codesandbox.io" ? /^\/(?:s|p\/sandbox|embed|p\/devbox)\/([\w-]+)/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://codesandbox.io/embed/${id}`, height: 500 } : null;
    },
  },
  {
    name: "StackBlitz",
    kind: "code",
    match: (url, h) => (h === "stackblitz.com" && /^\/(edit|github)\//.test(url.pathname) ? { src: `${url.origin}${url.pathname}?embed=1`, height: 500 } : null),
  },
  {
    name: "JSFiddle",
    kind: "code",
    match: (url, h) => {
      const path = h === "jsfiddle.net" ? url.pathname.replace(/\/(embedded\/?.*)?$/, "") : "";
      return path && path.split("/").filter(Boolean).length >= 1 ? { src: `https://jsfiddle.net${path}/embedded/`, height: 420 } : null;
    },
  },
  {
    name: "Observable",
    kind: "code",
    match: (url, h) => (h === "observablehq.com" && /^\/@[\w-]+\/[\w-]+/.test(url.pathname) ? { src: `https://observablehq.com/embed${url.pathname}`, height: 520 } : null),
  },
  {
    name: "Desmos",
    kind: "math",
    match: (url, h) => {
      const m = h === "desmos.com" ? /^\/(calculator|geometry|3d)(?:\/(\w+))?/.exec(url.pathname) : null;
      return m ? { src: `https://www.desmos.com/${m[1]}${m[2] ? "/" + m[2] : ""}?embed`, ratio: 16 / 10 } : null;
    },
  },
  {
    name: "GeoGebra",
    kind: "math",
    match: (url, h) => {
      const id = h === "geogebra.org" ? /^\/(?:m|material\/show\/id|calculator|classic|graphing)\/(\w+)/.exec(url.pathname)?.[1] : null;
      return id ? { src: `https://www.geogebra.org/material/iframe/id/${id}`, ratio: 16 / 10 } : null;
    },
  },
  {
    name: "Calendly",
    kind: "page",
    match: (url, h) => (h === "calendly.com" && url.pathname.length > 1 ? { src: `${url.origin}${url.pathname}?embed_type=Inline&hide_gdpr_banner=1`, height: 680 } : null),
  },
  {
    name: "Typeform",
    kind: "page",
    match: (url, h) => (/(^|\.)typeform\.com$/.test(h) && /^\/to\/\w+/.test(url.pathname) ? { src: url.href, height: 560 } : null),
  },
];

// A link to an embed, or null. `anyPage` allows other web pages too (many
// refuse to be shown inside another app).
export function toEmbed(text: string, anyPage = false): Embed | null {
  const url = u(text);
  if (!url) return null;
  const h = host(url);
  for (const p of providers) {
    const m = p.match(url, h);
    if (m && m.src.startsWith("https://")) return { provider: p.name, kind: p.kind, ...m };
  }
  if (anyPage && url.protocol === "https:") return { provider: h, kind: "page", src: url.href, ratio: 4 / 3 };
  return null;
}

export const providerNames = providers.map((p) => p.name);
