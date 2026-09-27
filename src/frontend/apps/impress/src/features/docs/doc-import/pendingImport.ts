/**
 * Files waiting to fill a document just made for them ("Import a file…"):
 * the document opens, and its editor reads the file in once it is ready
 * (a Word text, an Excel workbook, PowerPoint slides).
 */
const pending = new Map<string, File>();

export const setPendingImport = (docId: string, file: File) => {
  pending.set(docId, file);
};

/** The file waiting for this document, once (it is then forgotten). */
export const takePendingImport = (docId: string) => {
  const file = pending.get(docId);
  pending.delete(docId);
  return file;
};

export const hasPendingImport = (docId: string) => pending.has(docId);
