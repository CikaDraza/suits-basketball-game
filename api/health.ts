export function GET() {
  return Response.json(
    { service: 'suits-motion-analysis', status: 'ok', stage: 'foundation', aiEnabled: false },
    { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}
