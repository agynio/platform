import path from "node:path";
import { DOC_EXTENSIONS, DOCS_ROOT } from "./paths";

export function rewriteRelativeDocHref(href: string, sourcePath: string): string {
  if (!isRelativeHref(href)) {
    return href;
  }

  const { pathname, suffix } = splitHref(href);

  if (!isMarkdownHref(pathname) && !pathname.endsWith("/")) {
    return href;
  }

  const sourceDirectory = path.dirname(sourcePath);
  const absoluteTargetPath = path.resolve(sourceDirectory, pathname);
  const relativeTargetPath = path.relative(DOCS_ROOT, absoluteTargetPath);

  if (relativeTargetPath.startsWith("..") || path.isAbsolute(relativeTargetPath)) {
    throw new Error(`${sourcePath} links outside docs root: ${href}`);
  }

  return `${relativePathToSiteRoute(relativeTargetPath)}${suffix}`;
}

export function validateNoRootRelativeLinks(content: string, sourcePath: string) {
  const absoluteLinks = Array.from(content.matchAll(/\[[^\]]*\]\((\/[^/)][^)]*)\)/g));

  if (absoluteLinks.length === 0) {
    return;
  }

  const renderedLinks = absoluteLinks.map((match) => match[1]).join(", ");
  throw new Error(`${sourcePath} contains root-relative docs links: ${renderedLinks}`);
}

function isRelativeHref(href: string): boolean {
  return href.startsWith("./") || href.startsWith("../");
}

function splitHref(href: string): { pathname: string; suffix: string } {
  const suffixIndex = href.search(/[?#]/);

  if (suffixIndex === -1) {
    return { pathname: href, suffix: "" };
  }

  return {
    pathname: href.slice(0, suffixIndex),
    suffix: href.slice(suffixIndex),
  };
}

function isMarkdownHref(pathname: string): boolean {
  return DOC_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

function relativePathToSiteRoute(relativeTargetPath: string): string {
  const withoutExtension = removeMarkdownExtension(relativeTargetPath);
  const routeSegments = withoutExtension.split(path.sep);

  if (routeSegments.at(-1) === "README") {
    routeSegments.pop();
  }

  return routeSegments.length === 0 ? "/" : `/${routeSegments.join("/")}`;
}

function removeMarkdownExtension(relativeTargetPath: string): string {
  const extension = DOC_EXTENSIONS.find((docExtension) => relativeTargetPath.endsWith(docExtension));

  if (!extension) {
    return relativeTargetPath;
  }

  return relativeTargetPath.slice(0, -extension.length);
}
