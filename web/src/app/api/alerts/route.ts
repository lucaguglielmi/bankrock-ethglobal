import { NextResponse } from "next/server";
import { getAlertPreferences, saveAlertPreferences, AlertTopicsConfig } from "@/lib/alerts";
import { logger } from "@/lib/telemetry";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rockId = searchParams.get("rockId") || "1";

    const preferences = getAlertPreferences(rockId);

    return NextResponse.json({
      success: true,
      preferences,
    });
  } catch (error: unknown) {
    logger.error("Error in GET /api/alerts", error);
    return NextResponse.json(
      { error: "Failed to retrieve alert preferences" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as {
      rockId?: string | number;
      email?: string;
      pushEnabled?: boolean;
      topics?: Partial<AlertTopicsConfig>;
    };

    const rockId = body.rockId || 1;
    const email = typeof body.email === "string" ? body.email : "";
    const pushEnabled = Boolean(body.pushEnabled);
    const topics = body.topics || {};

    const updated = saveAlertPreferences(rockId, email, pushEnabled, topics);

    return NextResponse.json({
      success: true,
      message: "Alert preferences updated successfully.",
      preferences: updated,
    });
  } catch (error: unknown) {
    logger.error("Error in POST /api/alerts", error);
    return NextResponse.json(
      { error: "Failed to save alert preferences" },
      { status: 500 }
    );
  }
}
