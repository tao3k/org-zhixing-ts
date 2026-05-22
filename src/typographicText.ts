type CssLineBreak = "auto" | "normal" | "strict";
type CssWordBreak = "break-all" | "break-word" | "keep-all" | "normal";

type SoftBreakTextOptions = {
  lineBreak?: CssLineBreak;
  maxSegmentLength?: number;
  wordBreak?: CssWordBreak;
};

const DEFAULT_MAX_SEGMENT_LENGTH = 24;
const SOFT_BREAK = "<wbr>";
const breakAfterPattern = /[./:?#[\]@!$&'()*+,;=%_-]/u;

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" },
) => {
  segment(input: string): Iterable<{ segment: string }>;
};

export const renderSoftBreakText = (
  value: string | number,
  options: SoftBreakTextOptions = {},
): string => {
  const text = String(value);
  if (!text) {
    return "";
  }

  const maxSegmentLength = options.maxSegmentLength ?? DEFAULT_MAX_SEGMENT_LENGTH;
  const chunks = softBreakChunks(text, maxSegmentLength);

  return chunks.map(escapeHtml).join(SOFT_BREAK);
};

const softBreakChunks = (text: string, maxSegmentLength: number): string[] => {
  const chunks: string[] = [];
  let current = "";
  for (const segment of graphemeSegments(text)) {
    current += segment;
    if (breakAfterPattern.test(segment) || current.length >= maxSegmentLength) {
      chunks.push(current);
      current = "";
    }
  }
  if (current) {
    chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [text];
};

const graphemeSegments = (text: string): string[] => {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (!Segmenter) {
    return Array.from(text);
  }
  return Array.from(
    new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (item) => item.segment,
  );
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
