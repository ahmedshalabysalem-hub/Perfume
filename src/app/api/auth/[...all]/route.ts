import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";

// Better Auth endpoints (sign-in, sign-out, session). Sign-up is disabled in
// the auth configuration; rate limiting and origin checks apply here.
async function handle(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

const handlers = toNextJsHandler(handle);

export const GET = handlers.GET;
export const POST = handlers.POST;
