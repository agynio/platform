import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { DOCS_ROOT } from "@/lib/docs/paths";

type AssetRouteProps = {
  params: Promise<{
    path: string[];
  }>;
};

const ASSETS_ROOT = path.join(DOCS_ROOT, "_assets");

const CONTENT_TYPES = new Map<string, string>([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export async function GET(_request: Request, { params }: AssetRouteProps) {
  const { path: assetPath } = await params;
  const requestedPath = path.resolve(ASSETS_ROOT, ...assetPath);

  if (!requestedPath.startsWith(`${ASSETS_ROOT}${path.sep}`)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const asset = await fs.readFile(requestedPath);
    const contentType = CONTENT_TYPES.get(path.extname(requestedPath));

    return new NextResponse(asset, {
      headers: contentType ? { "content-type": contentType } : {},
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return new NextResponse("Not found", { status: 404 });
    }

    throw error;
  }
}
