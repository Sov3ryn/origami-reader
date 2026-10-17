const importable =
  /\.(txt|md|markdown|epub|pdf|docx|odt|rtf|html?|xhtml|fb2|fb2\.zip|mobi|azw3?|prc)$/i;
const MAX_FILES = 2000;

// Files and folders dropped on the window. Folders are searched recursively
// for supported documents; other files are ignored.
export async function droppedFiles(data: DataTransfer): Promise<File[]> {
  const entries = Array.from(data.items || [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (!entries.length)
    return Array.from(data.files).filter((f) => importable.test(f.name));
  const files: File[] = [];
  const visit = async (entry: FileSystemEntry): Promise<void> => {
    if (files.length >= MAX_FILES) return;
    if (entry.isFile) {
      if (!importable.test(entry.name)) return;
      files.push(
        await new Promise<File>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(resolve, reject),
        ),
      );
      return;
    }
    if (!entry.isDirectory) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns results in batches until an empty batch.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (!batch.length) break;
      for (const child of batch) await visit(child);
    }
  };
  for (const entry of entries) await visit(entry);
  return files;
}
