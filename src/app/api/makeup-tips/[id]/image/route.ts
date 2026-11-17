import type { NextRequest } from "next/server";
import { makeupImage } from "@/lib/makeup-image-server";

export function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return makeupImage(req, context, "ops_makeup_tips");
}
