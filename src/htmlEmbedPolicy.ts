const allowedIframeHosts = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "maps.google.com",
  "www.google.com",
]);

export const applyHtmlEmbedPolicy = (root: ParentNode): void => {
  for (const frame of root.querySelectorAll<HTMLIFrameElement>("iframe")) {
    const src = frame.getAttribute("src");
    if (!src || !isAllowedIframeSrc(src)) {
      frame.remove();
      continue;
    }
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
    if (!frame.getAttribute("title")) {
      frame.setAttribute("title", iframeTitle(src));
    }
  }
};

const isAllowedIframeSrc = (src: string): boolean => {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:") {
      return false;
    }
    if (!allowedIframeHosts.has(url.hostname)) {
      return false;
    }
    return isAllowedYouTubeEmbed(url) || isAllowedGoogleMapsEmbed(url);
  } catch {
    return false;
  }
};

const isAllowedYouTubeEmbed = (url: URL): boolean =>
  /(^|\.)youtube(?:-nocookie)?\.com$/.test(url.hostname) &&
  /^\/embed\/[A-Za-z0-9_-]+$/.test(url.pathname);

const isAllowedGoogleMapsEmbed = (url: URL): boolean =>
  (url.hostname === "maps.google.com" && url.pathname === "/maps") ||
  (url.hostname === "www.google.com" && url.pathname.startsWith("/maps/embed"));

const iframeTitle = (src: string): string => {
  const url = new URL(src);
  if (isAllowedYouTubeEmbed(url)) {
    return "YouTube video";
  }
  if (isAllowedGoogleMapsEmbed(url)) {
    return "Google Maps preview";
  }
  return "Embedded content";
};
