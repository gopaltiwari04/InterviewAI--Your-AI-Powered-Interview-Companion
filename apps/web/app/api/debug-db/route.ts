export async function GET() {
  const db = process.env.DATABASE_URL ?? "";

  return Response.json({
    host: db.split("@")[1]?.split("/")[0],
  });
}