import { publicAssetUrl } from "./config";
import type { AttachmentDisplayRecord } from "./model";

export const attachmentPublicUrl = (
  record: AttachmentDisplayRecord,
  sourceFile: string | undefined,
): string => publicAssetUrl(attachmentPublicPath(record, sourceFile)).toString();

export const attachmentPublicPath = (
  record: AttachmentDisplayRecord,
  sourceFile: string | undefined,
): string => {
  const directoryPath = normalizePublicPath(record.directoryPath);
  const linkPath = normalizePublicPath(record.linkPath);
  const joined = joinPath(directoryPath, linkPath);
  const sourceRoot = sourceFile ? normalizePublicPath(sourceFile).split("/")[0] : "";
  if (!sourceFile || (sourceRoot && directoryPath.startsWith(`${sourceRoot}/`))) {
    return joined;
  }
  return joinPath(dirname(sourceFile), joined);
};

export const normalizePublicPath = (value: string): string => publicSegments(value).join("/");

export const basename = (path: string): string => {
  const normalized = normalizePublicPath(path);
  return normalized.split("/").filter(Boolean).at(-1) ?? "";
};

const dirname = (path: string): string => {
  const normalized = normalizePublicPath(path);
  const slash = normalized.lastIndexOf("/");
  return slash === -1 ? "" : normalized.slice(0, slash);
};

const joinPath = (...parts: string[]): string => parts.flatMap(publicSegments).join("/");

const publicSegments = (value: string): string[] => {
  const segments = value.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  const publicIndex = segments.lastIndexOf("public");
  return publicIndex === -1 ? segments : segments.slice(publicIndex + 1);
};
