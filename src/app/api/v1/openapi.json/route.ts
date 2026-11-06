import { appUrl } from "@/lib/docs";
import { openApiSpec } from "@/lib/integrations/openapi";

export async function GET() {
  return Response.json(openApiSpec(await appUrl()));
}
