"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser auth client. Sign-in goes through the /api/auth HTTP handler (not a
 * Server Action) so Better Auth's rate limiting and origin checks apply.
 */
export const authClient = createAuthClient();
