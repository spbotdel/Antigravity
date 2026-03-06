export async function POST() {
  return Response.json(
    {
      error: "Маршрут устарел. Используйте единый file upload flow через /api/media/upload-intent и /api/media/complete."
    },
    { status: 410 }
  );
}
