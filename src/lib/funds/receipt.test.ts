import { describe, expect, it } from "vitest";
import { fileSizeKb, receiptFileName } from "./receipt";

describe("receipt helpers", () => {
  it("rounds the size to whole KB with a floor of 1", () => {
    expect(fileSizeKb(0)).toBe(1);
    expect(fileSizeKb(100)).toBe(1);
    expect(fileSizeKb(1024)).toBe(1);
    expect(fileSizeKb(184 * 1024 + 300)).toBe(184);
  });

  it("reads the name from a File or from a stored receipt", () => {
    expect(receiptFileName(new File(["x"], "transfer.pdf"))).toBe("transfer.pdf");
    expect(receiptFileName({ file_name: "stored.jpg", size_kb: 3 })).toBe("stored.jpg");
  });
});
