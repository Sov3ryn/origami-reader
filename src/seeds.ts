import { createBook, paragraphsFromText } from "./documents";
import type { Book } from "./types";
export function sampleBooks(): Book[] {
  const samples = [
    [
      "The Atlas of Quiet Places",
      "Elena Vale",
      "lake",
      `# Chapter 1 · The shore at dusk

By the time Mara reached the lake, the wind had fallen quiet. A narrow path followed the water through the reeds, and every stone held the last warmth of the day.

She stopped where the old jetty met the shore. Across the lake, the windows of a distant house glowed like lanterns. Someone had left a small paper crane on the railing, its wings folded toward the sky.

Some places ask nothing of us except that we arrive.

Mara turned the crane gently in her hands. Beneath one wing, in handwriting she remembered, were three words: Take your time.

For the first time in months, she did.

# Chapter 2 · What the tide kept

Morning came quietly. The lake wore a veil of mist, and a heron stood beside the jetty as though it had been waiting all night.

Mara put the paper crane in her pocket and followed the path toward the house. The door was already open.

Inside, a kettle began to sing. She smiled at the familiar sound, then stepped over the threshold.`,
    ],
    [
      "A Field Guide to Small Wonders",
      "Jonas Reed",
      "forest",
      `# Chapter 1 · A slower kind of looking

There is a whole world in the space between one hurried thought and the next. A leaf turning in the wind. A bird returning to the same branch. The light moving across a kitchen floor.

You do not need to travel far to find something worth noticing. You need only to stand still long enough to see what was already there.

# Chapter 2 · The ordinary garden

On the first warm day of spring, the garden seemed to wake in layers. First the soil, then the stems, then a small bright flower beside the gate.

I wrote its name in my notebook. Then I crossed it out and wrote what it had made me feel instead.`,
    ],
    [
      "The Paper Kingdom",
      "Lila Chen",
      "paper",
      `# Chapter 1 · A mountain made by hand

The first mountain was folded from a letter. The second came from a map. By the time the valley was finished, the table had become a country.

In the paper kingdom, nothing was quite as fragile as it appeared. Every crease remembered a decision. Every small bridge held the weight of a journey.

# Chapter 2 · A river of blue

The river began as a ribbon on the table. It found its way between the mountains, gathering light in every bend.

A paper crane watched from the tallest roof. When the window opened, the whole kingdom held its breath.`,
    ],
  ];
  return samples.map(([title, author, cover, text], index) => {
    const b = createBook(
      title,
      paragraphsFromText(text),
      "Sample",
      "sample-" + index,
    );
    b.meta.id = "sample-" + index;
    b.meta.author = author;
    b.meta.cover = cover;
    b.meta.collection = index === 0 ? "Evening reading" : "Books";
    return b;
  });
}
