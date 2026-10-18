// Origami Studio: the fixed book template for print PDFs.
//
// The book arrives as data: /book.json (text) and /layout.json (trim,
// margins, font). Strings are placed as text only. Nothing from the book is
// ever evaluated as Typst markup or code.

#import "vendor/droplet-0.3.1/src/lib.typ": dropcap

#let L = json("/layout.json")
#let B = json("/book.json")
#let M = B.meta
#let fr = M.lang == "fr"

#let T = if fr {
  (
    chapter: "Chapitre",
    contents: "Table des matières",
    made: "Réalisé avec Origami Studio",
    preface: "Préface",
    epilogue: "Épilogue",
    first: "Première publication\u{A0}: ",
    setin: "Composé en ",
    typeset: "Mise en page\u{A0}: Origami Studio.",
    crane: "Grue en origami, logo d'Origami Studio",
    thanks: "Remerciements",
    about: "À propos de l'auteur",
    also: "Du même auteur",
  )
} else {
  (
    chapter: "Chapter",
    contents: "Contents",
    made: "Made with Origami Studio",
    preface: "Preface",
    epilogue: "Epilogue",
    first: "First published ",
    setin: "Set in ",
    typeset: "Typeset with Origami Studio.",
    crane: "Origami crane, the Origami Studio logo",
    thanks: "Acknowledgements",
    about: "About the Author",
    also: "Also by " + M.author,
  )
}

// Metrics. Every line box is exactly 1em (top-edge 0.8em, bottom-edge
// -0.2em), so baseline-to-baseline distance is the `lead` setting.
#let size = L.size * 1pt
#let lead = L.lead * 1pt
#let gap = lead - size
#let trim-w = L.trim_w * 1in
#let trim-h = L.trim_h * 1in
#let block-h = trim-h - (L.top + L.bottom) * 1in
#let lines(n) = n * lead

#set document(
  title: M.title,
  author: M.author,
  keywords: ("Origami Studio", "Made with Origami Studio"),
  date: auto,
)

#set text(
  font: L.font,
  fallback: false,
  size: size,
  lang: M.lang,
  region: if fr { "FR" } else if M.lang == "en" { "GB" } else { none },
  hyphenate: true,
  top-edge: 0.8em,
  bottom-edge: -0.2em,
  number-type: "old-style",
  // A retry after a layout failure turns the widow and orphan rules off.
  costs: if L.at("costs", default: true) {
    (hyphenation: 100%, runt: 100%, widow: 100%, orphan: 100%)
  } else {
    (hyphenation: 100%, runt: 0%, widow: 0%, orphan: 0%)
  },
)
#set smartquote(enabled: false)
#set par(
  justify: true,
  linebreaks: "optimized",
  justification-limits: (
    spacing: (min: 80%, max: 140%),
    tracking: (min: -0.01em, max: 0.012em),
  ),
  leading: gap,
  spacing: gap,
  first-line-indent: (amount: 1.3em, all: true),
)
#set heading(numbering: none)

// ---------------------------------------------------------------- pages

// Every section (front matter piece or chapter) opens with a "start" marker
// and closes with an "end" marker. Headers and footers read them to decide
// what a page shows: openers and blank pages show nothing.
#let start-mark(head: true, folio: true, roman: false) = [#metadata((
      kind: "start",
      head: head,
      folio: folio,
      roman: roman,
    )) <pg-mark>]
#let end-mark = [#metadata((kind: "end")) <pg-mark>]

// Page table: what every physical page shows, built once from all markers.
// It takes no arguments, so Typst memoizes it and each header or footer does
// a single lookup. (A query per page cost 3 s and 1.4 GB on a 786-page book.)
#let blank-state = (show-head: false, show-folio: false, roman: false)
#let page-table() = {
  let marks = query(<pg-mark>).map(m => (page: m.location().page(), ..m.value))
  if marks.len() == 0 { return () }
  let out = ()
  let cur = none
  let i = 0
  for p in range(1, marks.last().page + 2) {
    let opener = false
    let st = if cur == none { blank-state } else {
      (show-head: cur.head, show-folio: cur.folio, roman: cur.roman)
    }
    while i < marks.len() and marks.at(i).page == p {
      let m = marks.at(i)
      if m.kind == "start" {
        opener = true
        cur = m
      } else {
        cur = none
      }
      i += 1
    }
    // Openers show nothing; a page after an end marker is a blank verso.
    out.push(if opener { blank-state } else { st })
  }
  out
}

#let page-state() = page-table().at(here().page() - 1, default: blank-state)

#let caps(body, tracking: 0.08em) = text(tracking: tracking, smallcaps(all: true, body))

#let running-head() = context {
  let st = page-state()
  if not st.show-head { return none }
  let p = here().page()
  let label = if calc.even(p) { M.author } else { M.title }
  align(center, text(size: 0.82em, caps(label, tracking: 0.12em)))
}

#let folio() = context {
  let st = page-state()
  if not st.show-folio { return none }
  let n = counter(page).get().first()
  align(center, text(size: 0.9em, numbering(if st.roman { "i" } else { "1" }, n)))
}

#set page(
  width: trim-w,
  height: trim-h,
  bleed: if L.bleed { (top: 0.125in, bottom: 0.125in, outside: 0.125in, inside: 0pt) } else { 0pt },
  binding: left,
  margin: (
    inside: L.inside * 1in,
    outside: L.outside * 1in,
    top: L.top * 1in,
    bottom: L.bottom * 1in,
  ),
  header-ascent: 35%,
  footer-descent: 35%,
  numbering: "i",
  header: running-head(),
  footer: folio(),
)

// ---------------------------------------------------------------- text

#let render-run(r) = {
  if type(r) == str {
    r
  } else if "br" in r {
    linebreak()
  } else if r.at("i", default: false) {
    emph(r.t)
  } else {
    r.t
  }
}
#let render-runs(runs) = runs.map(render-run).join()

#let lead-punct = ("\u{201C}", "\u{2018}", "\u{AB}", "\"", "'")
#let spaces = ("\u{202F}", "\u{A0}", " ")
#let dashes = ("\u{2014}", "\u{2013}")

// First paragraph of a chapter: three-line drop cap, then the rest of the
// first words in small capitals. Leading quotation marks hang in the margin.
// Dialogue openers (dash) get the small-capital lead-in only.
#let opening-par(runs, more: ()) = {
  let first = runs.at(0)
  if type(first) != str {
    return par(render-runs(runs))
  }
  let cl = first.clusters()
  let i = 0
  let pre = ""
  while i < cl.len() and cl.at(i) in lead-punct {
    pre += cl.at(i)
    i += 1
  }
  while i < cl.len() and cl.at(i) in spaces {
    pre += cl.at(i)
    i += 1
  }
  let dialogue = i < cl.len() and cl.at(i) in dashes
  // Small-capital lead-in: up to three words, stopping after punctuation.
  let rest-start = if dialogue { 0 } else { i + 1 }
  let rest = if rest-start < cl.len() { cl.slice(rest-start).join() } else { "" }
  let words = rest.split(" ")
  let n = 0
  let lead-words = ()
  for w in words {
    if n >= 3 { break }
    lead-words.push(w)
    n += 1
    if w.len() > 0 and w.clusters().last() in (",", ".", ";", ":", "!", "?", "\u{202F}") { break }
  }
  let lead-in = lead-words.join(" ")
  let after = if lead-words.len() < words.len() { words.slice(lead-words.len()).join(" ") } else { "" }
  let tail = runs.slice(1)
  let body = {
    smallcaps(lead-in)
    if after != "" { " " + after }
    render-runs(tail)
    for m in more {
      parbreak()
      render-runs(m)
    }
  }
  // Without drop caps (a retry after a layout failure), the small-capital lead-in stays.
  if dialogue or i >= cl.len() or not L.at("dropcap", default: true) {
    return par(body)
  }
  // Opening quotation marks are set at half size, raised, and hung in the
  // margin so the letter itself lines up with the text block.
  // The narrow space after a guillemet stays in the text (at half size) so
  // the PDF text layer keeps it.
  let small = if pre == "" { none } else {
    let raise = if pre.contains("\u{AB}") { -0.45em } else { -0.62em }
    text(size: 0.5em, baseline: raise, pre)
  }
  let letter = if small == none { cl.at(i) } else { small + cl.at(i) }
  context {
    let hang = if small == none { 0% } else {
      measure(text(small)).width / measure(text(letter)).width * 100%
    }
    // Inside the drop cap block only later paragraphs are indented.
    set par(first-line-indent: (amount: 1.3em, all: false))
    dropcap(height: 3, gap: 0.1em, overhang: hang, letter, body)
  }
}

#let render-block(b, first: false, more: (), indent: false, flush: false) = {
  if b.k == "p" {
    let role = b.at("role", default: none)
    if role == "dateline" or role == "signature" {
      align(right, par(first-line-indent: 0pt, render-runs(b.r)))
    } else if role == "salutation" {
      par(first-line-indent: 0pt, render-runs(b.r))
    } else if role == "center" {
      v(lines(1))
      align(center, caps(render-runs(b.r), tracking: 0.2em))
    } else if first {
      opening-par(b.r, more: more)
    } else if flush {
      par(first-line-indent: 0pt, render-runs(b.r))
    } else {
      par(render-runs(b.r))
    }
  } else if b.k == "hr" {
    [#metadata("hr") <scene-break>]
    // One blank line above and below keeps the baseline grid.
    block(
      width: 100%,
      above: lines(1) + gap,
      below: lines(1) + gap,
      sticky: true,
      align(center, text(tracking: 0.6em, "*\u{2009}*\u{2009}*")),
    )
  } else if b.k == "q" {
    let verse = b.at("verse", default: false)
    block(
      inset: (left: if verse { 2.5em } else { 1.5em }, right: if verse { 0em } else { 1.5em }),
      above: lines(1) + gap,
      below: lines(1) + gap,
      {
        set par(justify: not verse, first-line-indent: if verse { 0pt } else { (amount: 1.3em, all: true) })
        for x in b.b { render-block(x) }
      },
    )
  }
}

// ---------------------------------------------------------------- crane mark

#let crane(h) = {
  if L.mark == "png" {
    image("assets/crane-screen.png", height: h, alt: T.crane)
  } else {
    image("assets/crane-print.svg", height: h, alt: T.crane)
  }
}
#let studio-mark(h: 4mm) = box(grid(
  columns: 2,
  column-gutter: 1.2mm,
  align: horizon,
  crane(h), text(size: 6.5pt, number-type: "lining", T.made),
))

// ---------------------------------------------------------------- front matter

// Display lines (titles, headings, contents) are never justified or hyphenated.
#let display(body) = {
  set par(justify: false, first-line-indent: 0pt)
  set text(hyphenate: false)
  body
}

// Half-title (recto, i)
#start-mark(head: false, folio: false, roman: true)
#v(block-h * 0.28)
#display(align(center, text(size: 1.25em, caps(M.title, tracking: 0.18em))))
#end-mark

// Title page (recto, iii)
#pagebreak(to: "odd")
#start-mark(head: false, folio: false, roman: true)
#v(block-h * 0.22)
#display(align(center, {
  set par(leading: 0.5em)
  text(size: 2.1em, caps(M.title, tracking: 0.1em))
  v(lines(2))
  text(size: 1.2em, style: "italic", M.author)
}))
#end-mark

// Copyright page (verso, iv)
#pagebreak()
#start-mark(head: false, folio: false, roman: true)
#v(1fr)
#{
  set par(justify: false, first-line-indent: 0pt, leading: 0.35em, spacing: 0.9em)
  set text(size: 8pt, hyphenate: false)
  [#M.title \ #M.author]
  parbreak()
  if M.at("first_published", default: "") != "" { T.first + M.first_published + "." }
  parbreak()
  for line in M.at("rights", default: ()) { line; parbreak() }
  if M.at("ai", default: "") != "" { M.ai; parbreak() }
  T.typeset
  parbreak()
  T.setin + L.font + "."
}
#v(lines(2))
#align(right, studio-mark())
#end-mark

// Dedication and epigraph (recto), when the book has them.
#let front-page(body) = {
  pagebreak(to: "odd")
  start-mark(head: false, folio: false, roman: true)
  v(block-h * 0.3)
  body
  end-mark
}
#if M.at("dedication", default: "") != "" {
  front-page(display(align(center, text(style: "italic", M.dedication))))
}
#if M.at("epigraph", default: "") != "" {
  front-page(display(align(right, block(width: 75%, {
    set par(justify: false)
    align(left, text(style: "italic", M.epigraph))
    if M.at("epigraph_by", default: "") != "" {
      v(lines(1))
      align(right, text(size: 0.92em, caps(M.epigraph_by, tracking: 0.04em)))
    }
  }))))
}

// Contents (recto, v)
#pagebreak(to: "odd")
#start-mark(head: false, folio: true, roman: true)
#v(lines(4))
#align(center, text(size: 1.1em, caps(T.contents, tracking: 0.18em)))
#v(lines(2))
#context {
  let starts = query(<chapter-start>)
  set par(justify: false, first-line-indent: 0pt, hanging-indent: 1.5em, spacing: gap + 0.25em)
  set text(hyphenate: false)
  let titled = B.chapters.any(c => c.at("title", default: none) != none)
  let entries = for (i, ch) in B.chapters.enumerate() {
    if i >= starts.len() { break }
    let loc = starts.at(i).location()
    let pg = numbering("1", ..counter(page).at(loc))
    let num = ch.at("num", default: none)
    let title = ch.at("title", default: none)
    let label = if title != none and num != none {
      [#num.#h(0.5em)#caps(title, tracking: 0.03em)]
    } else if title != none {
      caps(title, tracking: 0.03em)
    } else if num != none { T.chapter + " " + num } else { T.chapter + " " + str(i + 1) }
    par(link(loc)[#label#h(0.4em)#box(width: 1fr, repeat(gap: 0.25em)[.])#h(0.3em)#pg])
  }
  // Untitled chapters ("Chapter XII") fit in two columns.
  if titled { entries } else { columns(2, gutter: 2.5em, entries) }
}
#end-mark

// ---------------------------------------------------------------- body

#show heading.where(level: 1): it => block(width: 100%, above: 0pt, below: 0pt, {
  set text(weight: "regular", hyphenate: false)
  set par(justify: false, first-line-indent: 0pt, leading: 0.55em)
  align(center, it.body)
})

#pagebreak(to: "odd", weak: true)
#set page(numbering: "1")
#counter(page).update(1)

#for (idx, ch) in B.chapters.enumerate() {
  if idx > 0 { pagebreak(to: "odd", weak: true) }
  start-mark(head: true, folio: true, roman: false)
  [#metadata(idx) <chapter-start>]
  v(block-h * 0.24)
  let title = ch.at("title", default: none)
  // Untitled chapters are numbered.
  let num = ch.at("num", default: if title == none { str(idx + 1) } else { none })
  heading(level: 1, {
    if num != none { text(size: 1.0em, caps(T.chapter + " " + num, tracking: 0.2em)) }
    if title != none {
      if num != none {
        linebreak()
        v(0.6em)
      }
      let long = title.len() > 70
      if long {
        block(width: 85%, text(size: 0.85em, caps(title, tracking: 0.03em)))
      } else {
        text(size: 1.15em, caps(title, tracking: 0.05em))
      }
    }
  })
  v(lines(3))
  // A short first paragraph (under about three lines) takes the next plain
  // paragraphs along so the text keeps wrapping the drop cap.
  let blocks = ch.blocks
  let start = 1
  let more = ()
  if blocks.len() > 0 and blocks.at(0).k == "p" {
    let chars = blocks.at(0).r.map(r => if type(r) == str { r.len() } else { r.at("t", default: "").len() }).sum(default: 0)
    while chars < 230 and start < blocks.len() and blocks.at(start).k == "p" and blocks.at(start).at("role", default: none) == none {
      more.push(blocks.at(start).r)
      chars += blocks.at(start).r.map(r => if type(r) == str { r.len() } else { r.at("t", default: "").len() }).sum(default: 0)
      start += 1
    }
  }
  for (j, b) in blocks.enumerate() {
    if j == 0 {
      render-block(b, first: true, more: more)
    } else if j >= start {
      render-block(b, flush: blocks.at(j - 1).k == "hr")
    }
  }
  end-mark
}

// ---------------------------------------------------------------- back matter
#let back-section(title, body) = {
  pagebreak(to: "odd", weak: true)
  start-mark(head: false, folio: true, roman: false)
  v(block-h * 0.12)
  display(align(center, text(size: 1.05em, caps(title, tracking: 0.18em))))
  v(lines(2))
  body
  end-mark
}
#let paras(text-value) = {
  for (i, p) in text-value.split("\n").filter(x => x.trim() != "").enumerate() {
    par(first-line-indent: if i == 0 { 0pt } else { 1.3em }, p.trim())
  }
}
#if M.at("acknowledgements", default: "") != "" { back-section(T.thanks, paras(M.acknowledgements)) }
#if M.at("about", default: "") != "" { back-section(T.about, paras(M.about)) }
#if M.at("also_by", default: ()).len() > 0 {
  back-section(T.also, display(align(center, {
    for b in M.also_by { text(style: "italic", b); linebreak() }
  })))
}
