// Book mode: the text set as a printed book, two pages at a time, with page
// turns you can click, drag, scroll or play with the keyboard, and an opening
// that shows the closed book, opens its cover to the title page, then turns
// to the first chapter.
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import { Book as BookIcon } from "lucide-react";
import { t } from "../i18n";
import type { Annotation, Book, Paragraph } from "../types";
import { annotationColors } from "../themes";
import {
  BookPagination,
  bookSections,
  dropCap,
  firstAfterHeading,
  measureSection,
  type BookSection,
  type PageKind,
  type SectionMeasure,
} from "../bookLayout";
import { paragraphText, type SentenceMark } from "./ReadingPage";
import { Cover } from "./Primitives";
import { playPageTurn } from "../pageSound";
import { languageName } from "../bookLanguage";
import { isUnknownAuthor } from "../authorPack";
import { coverColor } from "../coverColor";

export type BookNav = {
  turn: (direction: 1 | -1) => void;
  show: (paragraph: number) => void;
  edge: (end: boolean) => void;
  // The word being read (its places on screen), to turn when it is on the next page.
  word: (ranges: Range[]) => void;
};

const COVER = -2;
const NONE = -1;
const TURN_MS = 860;
const OPEN_MS = 1700;
const GAP = 48;
// Page proportions of a trade paperback, which also match the covers.
const ASPECT = 0.7;

type Turn = {
  direction: 1 | -1;
  front: number;
  back: number;
  underLeft: number;
  underRight: number;
  target: number;
  drag: boolean;
  hold?: boolean;
};
type Geometry = {
  pageW: number;
  pageH: number;
  textW: number;
  textH: number;
  padTop: number;
  padInner: number;
  padOuter: number;
};

// Measurements survive leaving and reopening a book with the same layout.
const measureCache = new Map<string, SectionMeasure[]>();

const ease = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const BookParagraph = memo(function BookParagraph({
  p,
  first,
  drop,
  sectionStart,
  marks,
  speaking,
  spoken,
}: {
  p: Paragraph;
  first: boolean;
  drop: boolean;
  sectionStart: boolean;
  marks: Annotation[];
  speaking: boolean;
  spoken: SentenceMark | null;
}) {
  return (
    <div
      className={
        "passage" +
        (speaking ? (spoken ? " speaking-sentence" : " speaking") : "")
      }
      data-section-start={sectionStart || undefined}
    >
      {p.kind === "heading" ? (
        <h2
          data-paragraph={p.id}
          data-heading-level={p.headingLevel || 2}
          data-align={p.align}
        >
          {paragraphText(p, marks, spoken)}
        </h2>
      ) : (
        <p
          data-paragraph={p.id}
          data-quote={p.quote || undefined}
          data-align={p.align}
          data-first={first || undefined}
          data-dropcap={drop || undefined}
        >
          {paragraphText(p, marks, spoken)}
        </p>
      )}
    </div>
  );
});

const noMarks: Annotation[] = [];
// The paragraphs on one page, from the one at its top to the last that
// begins on it. A spacer places the first exactly where the measured flow
// had it, so lines and page breaks come out the same.
const PageSlice = memo(function PageSlice({
  paragraphs,
  section,
  from,
  to,
  offset,
  annotationsByParagraph,
  speaking,
  sentence,
}: {
  paragraphs: Paragraph[];
  section: BookSection;
  from: number;
  to: number;
  offset: number;
  annotationsByParagraph: Map<string, Annotation[]>;
  speaking: number;
  sentence: SentenceMark | null;
}) {
  const items: ReactNode[] = [];
  if (from !== section.start || offset > 0)
    items.push(
      <div
        key="spacer"
        className="book-slice-spacer"
        style={{ height: offset }}
      />,
    );
  for (let i = from; i <= to; i++) {
    const p = paragraphs[i];
    items.push(
      <BookParagraph
        key={p.id}
        p={p}
        drop={dropCap(paragraphs, i, section)}
        sectionStart={i === section.start}
        first={firstAfterHeading(paragraphs, i, section.start)}
        marks={annotationsByParagraph.get(p.id) || noMarks}
        speaking={speaking === i}
        spoken={sentence && sentence.paragraph === i ? sentence : null}
      />,
    );
  }
  return <>{items}</>;
});

export function BookView({
  rootRef,
  book,
  position,
  playing,
  onPosition,
  annotationsByParagraph,
  speaking,
  sentence,
  follow,
  pageClass,
  fontSize,
  lineHeight,
  layoutKey,
  fontName,
  opening,
  sound,
  interfaceLanguage,
  navRef,
}: {
  rootRef: RefObject<HTMLElement | null>;
  book: Book;
  position: number;
  playing: boolean;
  onPosition: (paragraph: number) => void;
  annotationsByParagraph: Map<string, Annotation[]>;
  speaking: number;
  sentence: SentenceMark | null;
  follow: boolean;
  pageClass: string;
  fontSize: number;
  lineHeight: number;
  layoutKey: string;
  fontName: string;
  opening: boolean;
  sound: boolean;
  interfaceLanguage: string;
  navRef: MutableRefObject<BookNav | null>;
}) {
  const stage = useRef<HTMLDivElement | null>(null);
  const bookEl = useRef<HTMLDivElement>(null);
  const leafEl = useRef<HTMLDivElement>(null);
  const measureHost = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Page size from the space available; the text block is a whole number of
  // lines tall, so lines sit on the same grid on facing pages.
  const geometry = useMemo<Geometry | null>(() => {
    if (!box.w || !box.h) return null;
    const pageH = Math.floor(
      Math.min(box.h - 110, (box.w - 150) / 2 / ASPECT, 1150),
    );
    if (pageH < 360) return null;
    const pageW = Math.floor(pageH * ASPECT);
    const padTop = Math.round(pageH * 0.085);
    const padBottom = Math.round(pageH * 0.085);
    const padInner = Math.round(pageW * 0.115);
    const padOuter = Math.round(pageW * 0.09);
    const line = fontSize * lineHeight;
    const textH = Math.floor((pageH - padTop - padBottom) / line) * line;
    return {
      pageW,
      pageH,
      textW: pageW - padInner - padOuter,
      textH,
      padTop: padTop + Math.floor((pageH - padTop - padBottom - textH) / 2),
      padInner,
      padOuter,
    };
  }, [box.w, box.h, fontSize, lineHeight]);
  const stride = geometry ? geometry.textW + GAP : 1;

  const sections = useMemo(
    () => bookSections(book.paragraphs),
    [book.paragraphs],
  );
  const signature = geometry
    ? [book.meta.id, geometry.textW, geometry.textH, layoutKey, pageClass].join(
        "|",
      )
    : "";
  const [measured, setMeasured] = useState<{
    key: string;
    list: SectionMeasure[];
  } | null>(() =>
    signature && measureCache.has(signature)
      ? { key: signature, list: measureCache.get(signature)! }
      : null,
  );
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!signature || !measureHost.current) return;
    const cached = measureCache.get(signature);
    if (cached) {
      setMeasured({ key: signature, list: cached });
      return;
    }
    let cancelled = false;
    const host = measureHost.current;
    const list: SectionMeasure[] = [];
    setProgress(0);
    void (async () => {
      await document.fonts?.ready;
      let i = 0;
      while (i < sections.length && !cancelled) {
        const until = performance.now() + 14;
        while (i < sections.length && performance.now() < until) {
          list.push(measureSection(host, book.paragraphs, sections[i], stride));
          i++;
        }
        setProgress(i / sections.length);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (cancelled) return;
      measureCache.set(signature, list);
      setMeasured({ key: signature, list });
    })();
    return () => {
      cancelled = true;
    };
  }, [signature, sections, book.paragraphs, stride]);
  const pagination = useMemo(
    () =>
      measured && measured.key === signature
        ? new BookPagination(sections, measured.list)
        : null,
    [measured, signature, sections],
  );

  // The spine takes the cover art's dominant color.
  const [spine, setSpine] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSpine(null);
    if (book.meta.coverImage)
      void coverColor(book.meta.coverImage).then((c) => live && setSpine(c));
    return () => {
      live = false;
    };
  }, [book.meta.coverImage]);
  // Where the reader is: a spread, and the opening sequence if it plays.
  const playOpening = opening && position === 0 && !reducedMotion();
  const [phase, setPhase] = useState<
    "closed" | "opening" | "title" | "ready" | "closing"
  >(playOpening ? "closed" : "ready");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // Waits on the closed cover for a click: a new book until the reader opens
  // it, and a book the reader closed.
  const [held, setHeld] = useState(playOpening);
  // Closed by the reader (shown turned, without the arrival animation).
  const [shut, setShut] = useState(false);
  const [spread, setSpread] = useState<number | null>(playOpening ? 0 : null);
  const spreadRef = useRef(spread);
  spreadRef.current = spread;
  const [turn, setTurn] = useState<Turn | null>(
    playOpening
      ? {
          direction: 1,
          front: COVER,
          back: 0,
          underLeft: NONE,
          underRight: 1,
          target: 0,
          drag: false,
          hold: true,
        }
      : null,
  );
  const busy = useRef(false);
  // Where the turn under way is going, known the moment it starts (state
  // only catches up on the next render).
  const turnTarget = useRef<number | null>(null);
  // Turns asked for while one is under way, as a count (negative: back).
  const queued = useRef(0);
  const angle = useRef(playOpening ? 0 : 0);
  const frame = useRef(0);
  const anchor = useRef(position);
  const reported = useRef(-1);
  const [fade, setFade] = useState(0);

  // A new layout keeps the same passage in view.
  useEffect(() => {
    if (!pagination || phase !== "ready" || turn) return;
    setSpread(pagination.spreadOfParagraph(anchor.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination]);

  // Leaf drawing: rotation, shading on both faces and the shadow it casts.
  const apply = useCallback(
    (theta: number) => {
      const leaf = leafEl.current;
      const host = bookEl.current;
      if (!leaf || !host || !geometry) return;
      const r = (theta * Math.PI) / 180;
      const s = Math.sin(r);
      const c = Math.cos(r);
      leaf.style.transform = `rotateY(${-theta}deg)`;
      // Only the face turned toward the reader is shown. CSS backface hiding
      // alone fails where 3D compositing is off (some Linux setups).
      const [front, back] = Array.from(leaf.children) as HTMLElement[];
      if (front) front.style.visibility = theta < 90 ? "visible" : "hidden";
      if (back) back.style.visibility = theta < 90 ? "hidden" : "visible";
      host.style.setProperty("--lift", s.toFixed(3));
      host.style.setProperty("--turned", (theta / 180).toFixed(3));
      host.style.setProperty(
        "--front-dark",
        Math.min(1, theta / 95).toFixed(3),
      );
      host.style.setProperty(
        "--back-dark",
        Math.min(1, (180 - theta) / 95).toFixed(3),
      );
      host.style.setProperty("--cast-right", theta < 90 ? s.toFixed(3) : "0");
      host.style.setProperty("--cast-left", theta > 90 ? s.toFixed(3) : "0");
      host.style.setProperty(
        "--edge",
        (geometry.pageW * Math.abs(c)).toFixed(1) + "px",
      );
    },
    [geometry],
  );
  const animate = useCallback(
    (to: number, ms: number, done: () => void) => {
      cancelAnimationFrame(frame.current);
      const from = angle.current;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / Math.max(1, ms));
        angle.current = from + (to - from) * ease(p);
        apply(angle.current);
        if (p < 1) frame.current = requestAnimationFrame(step);
        else done();
      };
      frame.current = requestAnimationFrame(step);
    },
    [apply],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const spreads = pagination?.spreads ?? 1;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  const finishTurn = useCallback((completed: boolean) => {
    const current = turnRef.current;
    busy.current = false;
    turnTarget.current = null;
    if (current?.front === COVER && current.direction < 0) {
      // Closed: the cover stays shut until the reader opens it again.
      setPhase("closed");
      setHeld(true);
      setShut(true);
      setTurn({ ...current, direction: 1, hold: true });
      return;
    }
    if (current && completed) {
      setSpread(current.target);
      if (current.front === COVER) setPhase("title");
    }
    setTurn(null);
  }, []);
  const beginTurn = useCallback(
    (direction: 1 | -1, drag = false): boolean => {
      const k = spreadRef.current;
      if (k === null || !pagination) return false;
      if (busy.current) {
        if (!drag)
          queued.current = Math.max(
            -3,
            Math.min(3, queued.current + direction),
          );
        return false;
      }
      const next = k + direction;
      if (next < 0 || next >= pagination.spreads) return false;
      if (reducedMotion()) {
        setFade((f) => f + 1);
        setSpread(next);
        return false;
      }
      busy.current = true;
      turnTarget.current = next;
      angle.current = direction > 0 ? 0 : 180;
      setTurn(
        direction > 0
          ? {
              direction,
              front: 2 * k + 1,
              back: 2 * k + 2,
              underLeft: 2 * k,
              underRight: 2 * k + 3,
              target: next,
              drag,
            }
          : {
              direction,
              front: 2 * k - 1,
              back: 2 * k,
              underLeft: 2 * k - 2,
              underRight: 2 * k + 1,
              target: next,
              drag,
            },
      );
      if (sound) playPageTurn();
      return true;
    },
    [pagination, sound],
  );
  // A turn starts animating once its pages are on screen.
  useLayoutEffect(() => {
    if (!turn) {
      if (queued.current) {
        const direction = queued.current > 0 ? 1 : -1;
        queued.current -= direction;
        requestAnimationFrame(() => beginTurn(direction));
      }
      return;
    }
    apply(angle.current);
    if (turn.drag || turn.hold) return;
    const cover = turn.front === COVER;
    animate(
      turn.direction > 0 ? 180 : 0,
      cover ? OPEN_MS : queued.current ? TURN_MS * 0.6 : TURN_MS,
      () => finishTurn(true),
    );
  }, [turn, apply, animate, beginTurn, finishTurn]);

  // The opening: a moment on the closed book, the cover swings open to the
  // title page, then the first chapter.
  const openCover = useCallback(() => {
    setHeld(false);
    setShut(false);
    setPhase("opening");
    if (sound) playPageTurn(0.16);
    setTurn((current) => (current ? { ...current, hold: false } : current));
  }, [sound]);
  useEffect(() => {
    if (phase !== "closed" || held) return;
    const timer = setTimeout(openCover, 1100);
    return () => clearTimeout(timer);
  }, [phase, held, openCover]);
  useEffect(() => {
    if (phase !== "title" || !pagination || turn) return;
    const timer = setTimeout(() => {
      setPhase("ready");
      const target = pagination.spreadOfParagraph(position);
      if (target <= 1) beginTurn(1);
      else {
        setFade((f) => f + 1);
        setSpread(target);
      }
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pagination, turn, beginTurn]);
  // Back to the closed book: to the title spread, then the cover swings shut.
  const closeBook = useCallback(() => {
    if (phase !== "ready" || busy.current || !pagination || reducedMotion())
      return;
    const shut = () => {
      busy.current = true;
      angle.current = 180;
      setTurn({
        direction: -1,
        front: COVER,
        back: 0,
        underLeft: NONE,
        underRight: 1,
        target: 0,
        drag: false,
      });
      if (sound) playPageTurn(0.16);
    };
    // Closing is not reading: the title spread must not become the saved
    // position, so the phase changes before the spread does.
    setPhase("closing");
    if (spreadRef.current !== 0) {
      setFade((f) => f + 1);
      setSpread(0);
      setTimeout(shut, 380);
    } else shut();
  }, [phase, pagination, sound]);
  const skipOpening = useCallback(() => {
    cancelAnimationFrame(frame.current);
    busy.current = false;
    setTurn(null);
    setPhase("ready");
    setSpread(pagination ? pagination.spreadOfParagraph(position) : null);
  }, [pagination, position]);
  // Without a position yet (no opening), go to the saved passage.
  useEffect(() => {
    if (phase === "ready" && spread === null && pagination)
      setSpread(pagination.spreadOfParagraph(position));
  }, [phase, spread, pagination, position]);

  // Turning saves the reading position (not while narration leads).
  useEffect(() => {
    if (!pagination || spread === null || phase !== "ready") return;
    const paragraph = pagination.paragraphAtSpread(spread);
    anchor.current = paragraph;
    if (playing) return;
    if (pagination.spreadOfParagraph(position) === spread) return;
    reported.current = paragraph;
    onPosition(paragraph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread, pagination, phase]);
  // Position changes from elsewhere (narration, notes, contents) turn to it.
  const show = useCallback(
    (paragraph: number) => {
      if (!pagination) {
        anchor.current = paragraph;
        return;
      }
      const target = pagination.spreadOfParagraph(paragraph);
      // Going to a passage (contents, a note) while the book is closed or
      // opening opens it straight onto that passage.
      if (phaseRef.current !== "ready") {
        cancelAnimationFrame(frame.current);
        busy.current = false;
        setTurn(null);
        setHeld(false);
        setShut(false);
        setPhase("ready");
        setFade((f) => f + 1);
        setSpread(target);
        return;
      }
      const k = spreadRef.current;
      if (k === null || target === k) return;
      if (busy.current) {
        const pending = turnTarget.current;
        // Already turning there, or one more page after it.
        if (pending === target) return;
        if (pending !== null && Math.abs(target - pending) === 1) {
          queued.current = target > pending ? 1 : -1;
          return;
        }
      }
      if (Math.abs(target - k) === 1 && !busy.current) {
        beginTurn(target > k ? 1 : -1);
        return;
      }
      cancelAnimationFrame(frame.current);
      busy.current = false;
      setTurn(null);
      setFade((f) => f + 1);
      setSpread(target);
    },
    [pagination, beginTurn],
  );
  useEffect(() => {
    if (phase !== "ready" || reported.current === position) return;
    reported.current = -1;
    if (!playing || follow) show(position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, phase]);
  useEffect(() => {
    // Narration that starts on the closed book opens it onto the passage read.
    if (playing && follow && speaking >= 0) show(speaking);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaking]);
  // Narration crossing onto the next page inside one paragraph.
  useLayoutEffect(() => {
    if (!sentence || !follow || !playing || busy.current) return;
    const right = bookEl.current?.querySelector<HTMLElement>(
      ".book-page.right .book-text",
    );
    const mark = right?.querySelector<HTMLElement>(".sentence-mark");
    if (!right || !mark) return;
    const limit = right.getBoundingClientRect().right;
    if (mark.getBoundingClientRect().left >= limit - 2) beginTurn(1);
  }, [sentence, follow, playing, beginTurn]);

  navRef.current = {
    turn: (direction) => {
      if (phase === "closed" && held) openCover();
      else if (phase !== "ready") skipOpening();
      // Back from the first spread closes the book onto its cover.
      else if (direction < 0 && spreadRef.current === 0) closeBook();
      else beginTurn(direction);
    },
    show,
    edge: (end) => {
      if (!pagination) return;
      setFade((f) => f + 1);
      setSpread(end ? pagination.spreads - 1 : 1);
    },
    // A long sentence that runs onto the next page turns it when the voice gets
    // there, not when the next sentence starts.
    word: (ranges) => {
      if (!follow || !playing || busy.current || phase !== "ready") return;
      const right = bookEl.current?.querySelector<HTMLElement>(".book-page.right .book-text");
      if (!right) return;
      const limit = right.getBoundingClientRect().right;
      const here = ranges.find((r) => right.contains(r.startContainer));
      if (here && here.getBoundingClientRect().left >= limit - 2) beginTurn(1);
    },
  };

  // Pointer: click or drag the outer margins and corners to turn.
  const press = useRef<{
    direction: 1 | -1;
    x: number;
    time: number;
    started: boolean;
  } | null>(null);
  function hotDown(direction: 1 | -1, e: React.PointerEvent) {
    if (e.button !== 0 || phase !== "ready") return;
    if (direction < 0 && spreadRef.current === 0) {
      closeBook();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = {
      direction,
      x: e.clientX,
      time: performance.now(),
      started: false,
    };
  }
  function hotMove(e: React.PointerEvent) {
    const p = press.current;
    if (!p || !geometry) return;
    const dx = e.clientX - p.x;
    if (!p.started) {
      if (Math.abs(dx) < 6) return;
      p.started = beginTurn(p.direction, true);
      if (!p.started) {
        press.current = null;
        return;
      }
    }
    const span = geometry.pageW * 1.7;
    const amount = Math.max(
      0,
      Math.min(1, (p.direction > 0 ? -dx : dx) / span),
    );
    angle.current = p.direction > 0 ? amount * 180 : 180 - amount * 180;
    apply(angle.current);
  }
  function hotUp(e: React.PointerEvent) {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (!p.started) {
      beginTurn(p.direction);
      return;
    }
    const speed = (e.clientX - p.x) / Math.max(1, performance.now() - p.time);
    const done =
      p.direction > 0
        ? angle.current > 75 || speed < -0.6
        : angle.current < 105 || speed > 0.6;
    const end = done === p.direction > 0 ? 180 : 0;
    const remaining = Math.abs(end - angle.current) / 180;
    animate(end, Math.max(180, TURN_MS * remaining), () => finishTurn(done));
  }
  const lastWheel = useRef(0);

  // Pages.
  const bookmarkPages = useMemo(() => {
    const pages = new Map<number, string>();
    if (!pagination) return pages;
    book.paragraphs.forEach((p, i) => {
      const mark = annotationsByParagraph
        .get(p.id)
        ?.find((a) => a.kind === "bookmark");
      if (mark)
        pages.set(
          pagination.contentPageOf(i),
          annotationColors.find((c) => c.id === mark.color)?.value || "#b76809",
        );
    });
    return pages;
  }, [pagination, annotationsByParagraph, book.paragraphs]);
  const lang = book.meta.language || undefined;
  // The front pages need no measuring, so the opening can play meanwhile.
  function kindOf(index: number): PageKind {
    if (pagination) return pagination.page(index);
    if (index === 0) return { kind: "endpaper" };
    if (index === 1) return { kind: "title" };
    if (index === 2) return { kind: "colophon" };
    return { kind: "blank" };
  }
  function page(index: number, accessible: boolean): ReactNode {
    if (index === NONE) return null;
    if (index === COVER)
      return (
        <div className="book-cover-face">
          <div
            className="book-cover-art"
            style={{ transform: `scale(${(geometry?.pageW || 128) / 128})` }}
          >
            <Cover book={book.meta} />
          </div>
          <span className="book-cover-hinge" />
          <span className="book-cover-gloss" />
        </div>
      );
    const kind = kindOf(index);
    const side = index % 2 === 0 ? "left" : "right";
    switch (kind.kind) {
      case "endpaper":
        return <div className="book-endpaper" />;
      case "title":
        return (
          <div className="book-title-page">
            <span className="book-title-ornament" />
            <h1>{book.meta.title}</h1>
            <span className="book-title-rule" />
            {!isUnknownAuthor(book.meta.author) && <p>{book.meta.author}</p>}
            <div className="book-title-press">
              <img src="/crane.png" alt="" />
              <span>Origami Reader</span>
            </div>
          </div>
        );
      case "colophon":
        return (
          <div className="book-colophon">
            <p>
              <em>{book.meta.title}</em>
            </p>
            {!isUnknownAuthor(book.meta.author) && <p>{book.meta.author}</p>}
            <span className="book-title-rule" />
            <p>{t("Set in {font} for Origami Reader.", { font: fontName })}</p>
            {book.meta.language && (
              <p>{languageName(book.meta.language, interfaceLanguage)}</p>
            )}
          </div>
        );
      case "end":
        return (
          <div className="book-end-page">
            <span className="book-title-ornament" />
            <p>{t("The end")}</p>
          </div>
        );
      case "blank":
        return index >= (pagination?.totalPages ?? Infinity) ? (
          <div className="book-endpaper" />
        ) : null;
      case "content": {
        const section = sections[kind.section];
        const opener = section.opener && kind.local === 0;
        const ribbon = bookmarkPages.get(kind.index);
        const slice = pagination!.slice(kind.index);
        return (
          <>
            {!opener && (
              <div className="book-running-head">
                {side === "left"
                  ? book.meta.title
                  : section.title || book.meta.title}
              </div>
            )}
            <div
              className="book-text"
              lang={lang}
              aria-hidden={!accessible || undefined}
            >
              <div
                className={"book-flow" + (section.opener ? " opener" : "")}
                style={{ transform: `translateX(${-slice.shift * stride}px)` }}
              >
                <PageSlice
                  paragraphs={book.paragraphs}
                  section={section}
                  from={slice.from}
                  to={slice.to}
                  offset={slice.offset}
                  annotationsByParagraph={annotationsByParagraph}
                  speaking={speaking}
                  sentence={sentence}
                />
              </div>
            </div>
            <div className={"book-folio" + (opener ? " centered" : "")}>
              {kind.index + 1}
            </div>
            {ribbon && (
              <span
                className="book-ribbon"
                style={{ ["--ribbon" as string]: ribbon }}
                aria-hidden="true"
              />
            )}
          </>
        );
      }
    }
  }
  function sheet(
    index: number,
    side: "left" | "right",
    accessible: boolean,
    extra = "",
  ) {
    const kind =
      index >= 0 ? kindOf(index).kind : index === COVER ? "cover" : "";
    return (
      <div
        className={
          "book-page " +
          side +
          " " +
          pageClass +
          (kind ? " kind-" + kind : "") +
          (index === NONE ? " empty" : "") +
          extra
        }
      >
        {page(index, accessible)}
        <span className="book-gutter" aria-hidden="true" />
      </div>
    );
  }

  const k = spread ?? 0;
  const left = turn
    ? turn.underLeft
    : phase === "closed" || phase === "opening"
      ? NONE
      : 2 * k;
  const right = turn ? turn.underRight : 2 * k + 1;
  const done =
    pagination && spread !== null
      ? Math.min(1, spread / Math.max(1, spreads - 1))
      : 0;
  const style = (
    geometry
      ? {
          "--page-w": geometry.pageW + "px",
          "--page-h": geometry.pageH + "px",
          "--book-text-w": geometry.textW + "px",
          "--book-text-h": geometry.textH + "px",
          "--book-gap": GAP + "px",
          "--pad-top": geometry.padTop + "px",
          "--pad-inner": geometry.padInner + "px",
          "--pad-outer": geometry.padOuter + "px",
          "--stack-left": (2 + done * 12).toFixed(1) + "px",
          "--stack-right": (2 + (1 - done) * 12).toFixed(1) + "px",
          ...(spine ? { "--spine": spine } : {}),
        }
      : {}
  ) as CSSProperties;
  const section =
    pagination && spread !== null
      ? sections[
          pagination.sectionOfParagraph(pagination.paragraphAtSpread(spread))
        ]
      : null;
  const first = Math.max(1, 2 * k - 2);
  const last = Math.min(pagination?.contentPages ?? 0, 2 * k - 1);

  return (
    <div
      ref={(el) => {
        stage.current = el;
        (rootRef as MutableRefObject<HTMLElement | null>).current = el;
      }}
      className={"book-stage phase-" + phase + (shut ? " held" : "")}
      data-surface={/surface-(\w+)/.exec(pageClass)?.[1]}
      style={style}
      onWheel={(e) => {
        if (phase !== "ready" || e.ctrlKey) return;
        const delta =
          Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        if (Math.abs(delta) < 8) return;
        const now = performance.now();
        if (now - lastWheel.current < 520) return;
        lastWheel.current = now;
        beginTurn(delta > 0 ? 1 : -1);
      }}
    >
      {geometry && (
        <div
          ref={bookEl}
          className={"book" + (turn ? " turning" : "") + (fade ? " jump" : "")}
          key={"fade-" + fade}
        >
          <span className="book-stack left" aria-hidden="true" />
          <span className="book-stack right" aria-hidden="true" />
          <span className="book-spine-face" aria-hidden="true" />
          <span className="book-block-top" aria-hidden="true" />
          <span className="book-block-edge" aria-hidden="true" />
          {sheet(left, "left", true)}
          {sheet(right, "right", true)}
          <span className="book-cast left" aria-hidden="true" />
          <span className="book-cast right" aria-hidden="true" />
          {turn && (
            <div
              ref={leafEl}
              className={
                "book-leaf" + (turn.front === COVER ? " cover-leaf" : "")
              }
              aria-hidden="true"
            >
              <div className="leaf-face front">
                {turn.front === COVER
                  ? page(COVER, false)
                  : sheet(turn.front, "right", false)}
                <span className="leaf-shade" />
                <span className="leaf-gloss" />
              </div>
              <div className="leaf-face back">
                {sheet(turn.back, "left", false)}
                <span className="leaf-shade" />
                <span className="leaf-gloss" />
              </div>
            </div>
          )}
          {phase === "ready" && (
            <>
              <button
                className={"book-hot left" + (k <= 0 ? " closes" : "")}
                aria-label={k <= 0 ? t("Close the book") : t("Previous page")}
                disabled={k <= 0 && reducedMotion()}
                onPointerDown={(e) => hotDown(-1, e)}
                onPointerMove={hotMove}
                onPointerUp={hotUp}
                onPointerCancel={hotUp}
              />
              <button
                className="book-hot right"
                aria-label={t("Next page")}
                disabled={k >= spreads - 1}
                onPointerDown={(e) => hotDown(1, e)}
                onPointerMove={hotMove}
                onPointerUp={hotUp}
                onPointerCancel={hotUp}
              />
            </>
          )}
        </div>
      )}
      {phase === "closed" && held ? (
        <>
          <button
            className="book-cover-hit"
            aria-label={t("Open the book")}
            onClick={openCover}
          />
          <button className="book-skip text-button" onClick={openCover}>
            {t("Open the book")}
          </button>
        </>
      ) : (
        phase !== "ready" &&
        phase !== "closing" && (
          <button className="book-skip text-button" onClick={skipOpening}>
            {t("Skip")}
          </button>
        )
      )}
      {phase === "ready" && !pagination && (
        <div className="book-setting" role="status">
          <img src="/crane.png" alt="" />
          <span>
            {t("Setting the pages... {percent}%", {
              percent: Math.round(progress * 100),
            })}
          </span>
        </div>
      )}
      {phase === "ready" && pagination && spread !== null && (
        <div className="book-bar">
          <span className="book-bar-chapter">
            {section?.title || book.meta.title}
          </span>
          <input
            type="range"
            aria-label={t("Page")}
            min={0}
            max={spreads - 1}
            value={spread}
            onChange={(e) => {
              setFade((f) => f + 1);
              setSpread(+e.target.value);
            }}
          />
          <button
            className="icon-button book-close"
            aria-label={t("Close the book")}
            title={t("Close the book")}
            onClick={closeBook}
          >
            <BookIcon size={16} />
          </button>
          <span className="book-bar-pages">
            {last >= first
              ? t("Pages {first} to {last} of {count}", {
                  first,
                  last,
                  count: pagination.contentPages,
                })
              : t("{count} pages", { count: pagination.contentPages })}
          </span>
        </div>
      )}
      <div
        className={"book-page book-measure right " + pageClass}
        aria-hidden="true"
      >
        <div className="book-text" lang={lang} ref={measureHost} />
      </div>
    </div>
  );
}
