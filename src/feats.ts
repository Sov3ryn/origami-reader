// Records that a part of Origami was tried, for achievements. Components
// anywhere call recordFeat("id"); useReadingStats stores it once. Records
// made before it listens (a child drawn on the first frame) wait in a queue.
type Handler = (id: string) => void;
let handler: Handler | null = null;
const waiting: string[] = [];
export function recordFeat(id: string) {
  if (handler) handler(id);
  else if (!waiting.includes(id)) waiting.push(id);
}
export function listenForFeats(next: Handler) {
  handler = next;
  for (const id of waiting.splice(0)) next(id);
  return () => {
    if (handler === next) handler = null;
  };
}
