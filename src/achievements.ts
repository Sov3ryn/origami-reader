// Achievements: the goals that unlock themes, binding finishes, ribbon colours
// and bookmarks. Some count reading (time, days, finished books,
// celebrations); the rest are earned once by trying a part of Origami, a few
// of them secret until found. Places keep their own goals in places.ts.
import { goalProgress, type GoalMetric } from "./places";
import type { ReadingStats } from "./types";

export type Chapter = "first" | "explorer" | "voices" | "work" | "studio" | "journey" | "secrets";
export type Rewards = { themes?: string[]; finishes?: string[]; ribbons?: string[]; bookmarks?: string[] };
export type Achievement = {
  id: string;
  chapter: Chapter;
  name: string;
  goal: string;
  // A count to reach, or a feature to try once (recordFeat in feats.ts).
  metric?: GoalMetric;
  value?: number;
  feat?: string;
  secret?: boolean;
} & Rewards;

export const chapters: [Chapter, string][] = [
  ["first", "First steps"],
  ["explorer", "Explorer"],
  ["voices", "Voices"],
  ["work", "Work mode"],
  ["studio", "Studio"],
  ["journey", "Reading journey"],
  ["secrets", "Secrets"],
];

const hours = (n: number) => ({ metric: "activeSeconds" as const, value: n * 3600 });
const days = (n: number) => ({ metric: "distinctReadingDays" as const, value: n });
const books = (n: number) => ({ metric: "completedBooks" as const, value: n });

export const achievements: Achievement[] = [
  { id: "first-page", chapter: "first", name: "First page", goal: "Read or listen for 15 minutes.", metric: "activeSeconds", value: 900, themes: ["lake", "sage"] },
  { id: "hear-it", chapter: "first", name: "Hear it aloud", goal: "Play a book with read aloud.", feat: "listen", ribbons: ["amber", "blue", "rose"], bookmarks: ["pressed-wildflowers-paper"] },
  { id: "leave-a-mark", chapter: "first", name: "Leave a mark", goal: "Add a bookmark.", feat: "bookmark", bookmarks: ["midnight-moth-ribbon"] },
  { id: "margins", chapter: "first", name: "In the margins", goal: "Write a note in a book.", feat: "note", bookmarks: ["brass-feather"] },
  { id: "new-shelf", chapter: "first", name: "New shelf", goal: "Import a book or use Quick Read.", feat: "import", bookmarks: ["crane-charm-hook"] },
  { id: "make-it-yours", chapter: "first", name: "Make it yours", goal: "Change the theme or scene in Scene and colors.", feat: "restyle", themes: ["forest", "sky"] },

  { id: "turn-the-page", chapter: "explorer", name: "Turn the page", goal: "Switch to another reading mode in the Aa menu.", feat: "page-modes", bookmarks: ["lavender-botanical-paper"] },
  { id: "bookbinder", chapter: "explorer", name: "Bookbinder", goal: "Change a binding finish or the ribbon colour.", feat: "binding", finishes: ["silver"] },
  { id: "night-owl", chapter: "explorer", name: "Night owl", goal: "Switch between day and night.", feat: "day-night", bookmarks: ["woodland-owl"] },
  { id: "shortcut-hunter", chapter: "explorer", name: "Shortcut hunter", goal: "Open the keyboard shortcuts panel.", feat: "shortcuts", bookmarks: ["fox-key-hook"] },
  { id: "polyglot", chapter: "explorer", name: "Polyglot", goal: "Switch the interface language.", feat: "language", bookmarks: ["library-earth-globe"] },
  { id: "steady-gaze", chapter: "explorer", name: "Steady gaze", goal: "Use a focus tool or focus mode.", feat: "focus", bookmarks: ["midnight-moon-leather"] },
  { id: "lullaby", chapter: "explorer", name: "Lullaby", goal: "Set the sleep timer.", feat: "sleep-timer", bookmarks: ["sands-of-time"] },
  { id: "goodnight", chapter: "explorer", name: "Goodnight", goal: "Use Save place and close.", feat: "save-close", bookmarks: ["measure-of-time"] },
  { id: "cover-artist", chapter: "explorer", name: "Cover artist", goal: "Import or generate a book cover.", feat: "cover", themes: ["copper", "rose"], finishes: ["copper"] },
  { id: "collector", chapter: "explorer", name: "Collector", goal: "Create a collection.", feat: "collection", bookmarks: ["autumn-herbarium-paper"] },
  { id: "tongue-twister", chapter: "explorer", name: "Tongue twister", goal: "Add a pronunciation fix.", feat: "pronunciation", bookmarks: ["silver-fox-ribbon"] },
  { id: "keeper", chapter: "explorer", name: "Keeper of secrets", goal: "Create a vault.", feat: "vault", bookmarks: ["gilded-thorn-dagger"] },
  { id: "own-voice", chapter: "explorer", name: "A voice of its own", goal: "Give a book its own voice.", feat: "own-voice", bookmarks: ["twilight-wisteria-pennant"] },

  { id: "voice-browser", chapter: "voices", name: "Voice browser", goal: "Download a voice from the voice library.", feat: "voice-download", bookmarks: ["peacock-plume-feather"] },
  { id: "nevermore", chapter: "voices", name: "Nevermore", goal: "Generate a voice in the voice designer.", feat: "voice-generate", bookmarks: ["moonlit-raven-feather"] },
  { id: "voice-keeper", chapter: "voices", name: "Voice keeper", goal: "Save a voice you designed.", feat: "voice-save", themes: ["indigo", "seafoam"] },

  { id: "apprentice", chapter: "work", name: "Apprentice", goal: "Open the Work mode tutorial.", feat: "work-tutorial", bookmarks: ["copper-ginkgo-leaf"] },
  { id: "note-taker", chapter: "work", name: "Note taker", goal: "Create a note in Work mode.", feat: "work-note", bookmarks: ["sage-lily-leaf"] },
  { id: "study-buddy", chapter: "work", name: "Study buddy", goal: "Run a study session with your cards.", feat: "study", bookmarks: ["moonwatch-owl-hook"] },
  { id: "exam-ready", chapter: "work", name: "Exam ready", goal: "Start a practice test.", feat: "practice", bookmarks: ["moonveil-spear"] },
  { id: "planner", chapter: "work", name: "Planner", goal: "Create a plan, board or sheet.", feat: "work-plan", bookmarks: ["sunlit-orchard-pennant"] },
  { id: "bridge-builder", chapter: "work", name: "Bridge builder", goal: "Quote a book passage into a note, or link two documents.", feat: "work-link", bookmarks: ["midnight-lotus-leaf"] },
  { id: "scribe", chapter: "work", name: "Scribe", goal: "Write by hand or record a voice note.", feat: "work-scribe", ribbons: ["mint", "cyan", "slate"] },

  { id: "director", chapter: "studio", name: "Director", goal: "Create a Studio production.", feat: "studio-production", bookmarks: ["gothic-castle-window"] },
  { id: "casting-call", chapter: "studio", name: "Casting call", goal: "Cast a voice to a character.", feat: "studio-cast", themes: ["teahouse", "stone"] },
  { id: "showtime", chapter: "studio", name: "Showtime", goal: "Generate audio in a production.", feat: "studio-generate", bookmarks: ["moonlit-abbey-window"] },
  { id: "final-cut", chapter: "studio", name: "Final cut", goal: "Export an audiobook from Studio.", feat: "studio-export", bookmarks: ["ember-citadel-window"], finishes: ["rose-gold"] },

  { id: "hours-3", chapter: "journey", name: "Settling in", goal: "", ...hours(3), bookmarks: ["forest-gold-pennant"] },
  { id: "hours-5", chapter: "journey", name: "Regular reader", goal: "", ...hours(5), themes: ["navy", "lavender"] },
  { id: "hours-10", chapter: "journey", name: "Ten hours", goal: "", ...hours(10), bookmarks: ["origami-fox-maple"] },
  { id: "hours-20", chapter: "journey", name: "Well read", goal: "", ...hours(20), themes: ["olive", "olive-paper"], finishes: ["gunmetal"] },
  { id: "hours-35", chapter: "journey", name: "Deep waters", goal: "", ...hours(35), bookmarks: ["origami-koi-lotus"] },
  { id: "hours-50", chapter: "journey", name: "Knight of the page", goal: "", ...hours(50), bookmarks: ["silver-celestial-sword"], themes: ["orchid", "crimson"] },
  { id: "hours-75", chapter: "journey", name: "Dragon's hoard", goal: "", ...hours(75), bookmarks: ["ember-dragon-leather"] },
  { id: "hours-100", chapter: "journey", name: "Golden hundred", goal: "", ...hours(100), finishes: ["gold"] },
  { id: "days-3", chapter: "journey", name: "Coming back", goal: "", ...days(3), themes: ["coral", "apricot"] },
  { id: "days-7", chapter: "journey", name: "A week of pages", goal: "", ...days(7), bookmarks: ["sleeping-cat-stars"] },
  { id: "days-14", chapter: "journey", name: "Pack reader", goal: "", ...days(14), bookmarks: ["moonlit-wolf"] },
  { id: "days-30", chapter: "journey", name: "A month of stories", goal: "", ...days(30), themes: ["burgundy", "berry"] },
  { id: "days-60", chapter: "journey", name: "Ember and ash", goal: "", ...days(60), themes: ["ember", "peach"] },
  { id: "books-1", chapter: "journey", name: "The end", goal: "", ...books(1), bookmarks: ["gilded-stag-leather"] },
  { id: "books-3", chapter: "journey", name: "Trilogy", goal: "", ...books(3), themes: ["amber", "honey"] },
  { id: "books-5", chapter: "journey", name: "Paper cranes", goal: "", ...books(5), bookmarks: ["origami-crane-blossoms"] },
  { id: "books-10", chapter: "journey", name: "Northern lights", goal: "", ...books(10), themes: ["aurora", "mossrose"] },
  { id: "books-20", chapter: "journey", name: "Red planet", goal: "", ...books(20), bookmarks: ["observatory-mars-globe"] },
  { id: "celebrations-1", chapter: "journey", name: "Festive reader", goal: "", metric: "celebrations", value: 1, themes: ["petrol", "newsprint"] },
  { id: "celebrations-3", chapter: "journey", name: "All year round", goal: "", metric: "celebrations", value: 3, ribbons: ["orange", "red", "pink"] },

  { id: "midnight", chapter: "secrets", name: "Midnight reader", goal: "Read between midnight and 4 am.", feat: "midnight", secret: true, bookmarks: ["selenograph-moon-globe"] },
  { id: "early-bird", chapter: "secrets", name: "Early bird", goal: "Read between 4 and 7 am.", feat: "early", secret: true, themes: ["nordic", "nordic-snow"] },
  { id: "marathon", chapter: "secrets", name: "Marathon", goal: "Read for 2 hours in one day.", feat: "marathon", secret: true, bookmarks: ["copper-oak-sun-filigree"] },
  { id: "wanderer", chapter: "secrets", name: "Wanderer", goal: "Use Read, Work and Studio on the same day.", feat: "wanderer", secret: true, bookmarks: ["wandering-blue-box"] },
  { id: "full-circle", chapter: "secrets", name: "Full circle", goal: "Start a finished book over.", feat: "full-circle", secret: true, bookmarks: ["gold-ivy-moon-filigree"] },
  { id: "speed-reader", chapter: "secrets", name: "Speed reader", goal: "Listen at double speed or faster.", feat: "speed", secret: true, bookmarks: ["silver-wisteria-moon-filigree"] },
  { id: "fireworks", chapter: "secrets", name: "Fireworks", goal: "See fireworks over a place to read.", feat: "fireworks", secret: true, ribbons: ["plum", "olive", "lavender"] },
];

export function achieved(a: Achievement, stats: ReadingStats, completedBooks: number): boolean {
  if (a.feat) return stats.feats.includes(a.feat);
  return goalProgress(a.metric!, stats, completedBooks) >= a.value!;
}

// How far along a counted goal is, from 0 to 1.
export function progressOf(a: Achievement, stats: ReadingStats, completedBooks: number): number {
  if (a.feat) return stats.feats.includes(a.feat) ? 1 : 0;
  return Math.min(1, goalProgress(a.metric!, stats, completedBooks) / a.value!);
}
