import { appUrl } from "@/lib/docs";
import { openApiSpecV2 } from "@/lib/integrations/openapi";

export async function GET() {
  return Response.json(openApiSpecV2(await appUrl()));
}
