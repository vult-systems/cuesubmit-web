import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, type Role } from "@/lib/auth/permissions";
import { getShotById, updateShot } from "@/lib/db/production";
import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data");
const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasPermission(user.role as Role, "manage_productions")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const shotId = Number(id);
    const shot = getShotById(shotId);
    if (!shot) {
      return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("thumbnail") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No thumbnail file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only PNG and JPG files are allowed" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    // Create directory: data/thumbnails/{act_code}/
    const actDir = path.join(THUMBNAILS_DIR, shot.act_code);
    await fs.mkdir(actDir, { recursive: true });

    // Save as {shot_code}.jpg
    const filename = `${shot.code}.jpg`;
    const filePath = path.join(actDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());

    // Note: Server-side resize to 192x108 would require sharp.
    // For now, save the uploaded file directly.
    // TODO: Add sharp dependency for server-side resize if needed.
    await fs.writeFile(filePath, buffer);

    // Update shot record with relative path
    const relativePath = `${shot.act_code}/${filename}`;
    updateShot(shotId, { thumbnail: relativePath });

    return NextResponse.json({
      message: "Thumbnail uploaded",
      thumbnail: relativePath,
    });
  } catch (error) {
    console.error("Failed to upload thumbnail:", error);
    return NextResponse.json({ error: "Failed to upload thumbnail" }, { status: 500 });
  }
}
