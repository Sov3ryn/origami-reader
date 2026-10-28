// Short notes about the starter-library authors and books, shown on the
// Continue reading card. Portraits are public-domain images bundled with the
// app (see docs/ASSETS.md). Grayson Bray Morris, a living author, has an
// illustration of a writer's desk instead, credited as not a likeness.
import { useEffect, useState } from "react";
import manifest from "../assets/starter-library/manifest.json";
import { findAuthor, loadPack, loadPortrait, packNote } from "./authorPack";
import { t } from "./i18n";
import type { BookMeta } from "./types";

export type AuthorNote = {
  name: string;
  years: string;
  portrait?: string;
  bio: string;
  facts: string[];
  // Where the facts come from, for notes built from the author pack.
  source?: string;
  portraitCredit?: string;
};

function notes(): Record<string, AuthorNote> {
  return {
    "starter-count-monte-cristo": {
      name: "Alexandre Dumas",
      years: "1802-1870",
      portrait: "/authors/alexandre-dumas.webp",
      bio: t(
        "French novelist and playwright, one of the most widely read French authors. He also wrote The Three Musketeers, often working with his collaborator Auguste Maquet.",
      ),
      facts: [
        t(
          "The novel first appeared in installments in the Paris newspaper Journal des Débats from 1844 to 1846.",
        ),
        t(
          "The Château d'If, where Edmond Dantès is imprisoned, is a real island fortress off Marseille that visitors can tour today.",
        ),
        t(
          "With the book's success, Dumas built his own Château de Monte-Cristo near Paris. It is now a museum.",
        ),
      ],
    },
    "starter-pride-prejudice": {
      name: "Jane Austen",
      years: "1775-1817",
      portrait: "/authors/jane-austen.webp",
      bio: t(
        "English novelist known for witty, closely observed stories of family life and courtship. Her novels were published anonymously during her lifetime.",
      ),
      facts: [
        t(
          "Austen first drafted the novel in 1796 and 1797 as First Impressions.",
        ),
        t(
          "It was published in 1813, credited only to the author of Sense and Sensibility.",
        ),
        t(
          "In a letter to her sister Cassandra, Austen called the newly printed book her own darling child.",
        ),
      ],
    },
    "starter-dracula": {
      name: "Bram Stoker",
      years: "1847-1912",
      portrait: "/authors/bram-stoker.webp",
      bio: t(
        "Irish author who spent nearly thirty years as business manager of Henry Irving's Lyceum Theatre in London, writing fiction in his spare time.",
      ),
      facts: [
        t(
          "Dracula is told through letters, diary entries, newspaper clippings and a ship's log.",
        ),
        t(
          "A visit to Whitby in 1890 shaped the novel. Stoker came across the name Dracula in a book at the town's library.",
        ),
        t("It was first published in 1897."),
      ],
    },
    "starter-moonstone": {
      name: "Wilkie Collins",
      years: "1824-1889",
      portrait: "/authors/wilkie-collins.webp",
      bio: t(
        "English novelist and playwright, a close friend and collaborator of Charles Dickens, and a master of suspense. He also wrote The Woman in White.",
      ),
      facts: [
        t(
          "The Moonstone was serialized in 1868 in All the Year Round, the magazine edited by Charles Dickens.",
        ),
        t(
          "T. S. Eliot called it the first, the longest and the best of modern English detective novels.",
        ),
        t(
          "Sergeant Cuff was partly modelled on the real Scotland Yard detective Jonathan Whicher.",
        ),
      ],
    },
    "starter-journey-center-earth": {
      name: "Jules Verne",
      years: "1828-1905",
      portrait: "/authors/jules-verne.webp",
      bio: t(
        "French writer whose Extraordinary Voyages helped shape science fiction. He is one of the most translated authors in the world.",
      ),
      facts: [
        t("First published in French in 1864 as Voyage au centre de la Terre."),
        t(
          "The explorers enter the Earth through the crater of Snæfellsjökull, a real glacier-capped volcano in Iceland.",
        ),
        t(
          "This English text is the 1877 translation by Frederick Amadeus Malleson.",
        ),
      ],
    },
    "starter-grayson-stories": {
      name: "Grayson Bray Morris",
      years: "",
      portrait: "/authors/grayson-bray-morris.webp",
      portraitCredit: t("Illustration, not a likeness of the author"),
      bio: t(
        "Contemporary writer. This collection gathers sixteen of the author's short stories.",
      ),
      facts: [
        t(
          "The author shares these stories under a Creative Commons license (CC BY-SA 4.0), so anyone may read, share and adapt them with credit.",
        ),
      ],
    },
  };
}

// The note for a starter edition, matched by id or by its source file.
export function authorNote(book: BookMeta): AuthorNote | null {
  const edition = manifest.books.find(
    (b) => b.id === book.id || b.sha256 === book.sourceHash,
  );
  return edition ? notes()[edition.id] || null : null;
}

// The starter note, or one written from the offline author pack. Pack
// notes load in the background and follow the interface language.
export function useAuthorNote(
  book: BookMeta | undefined,
  language: string,
): AuthorNote | null {
  const starter = book ? authorNote(book) : null;
  const key =
    book && !starter
      ? [book.id, book.author, book.title, language].join("|")
      : "";
  const [found, setFound] = useState<{
    key: string;
    note: AuthorNote | null;
  }>();
  useEffect(() => {
    if (!key || !book) return;
    let live = true;
    loadPack(language)
      .then(async (pack) => {
        const author = findAuthor(pack, book);
        if (!author) {
          if (live) setFound({ key, note: null });
          return;
        }
        const note = packNote(pack, author, language, book.author);
        const portrait = await loadPortrait(author.id).catch(() => null);
        if (portrait) {
          note.portrait = portrait.url;
          note.portraitCredit = portrait.credit;
        }
        if (live) setFound({ key, note });
      })
      .catch(() => {
        if (live) setFound({ key, note: null });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return starter || (found?.key === key ? found.note : null);
}

// First and last initials, for authors without a portrait.
export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] || "") + (parts.length > 1 ? parts.at(-1)![0] : "")
  ).toUpperCase();
}
