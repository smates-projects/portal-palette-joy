/** A receipt as the form holds it (the picked File) or as the API stores it. */
export type NamedReceipt = { name: string } | { file_name: string };

/** File name of a receipt, whether it is a picked File or a stored `{ file_name }`. */
export function receiptFileName(receipt: NamedReceipt): string {
  return "file_name" in receipt ? receipt.file_name : receipt.name;
}

/** Size in whole KB for display; never below 1 so a tiny file does not read as "0 KB". */
export function fileSizeKb(sizeBytes: number): number {
  return Math.max(1, Math.round(sizeBytes / 1024));
}
