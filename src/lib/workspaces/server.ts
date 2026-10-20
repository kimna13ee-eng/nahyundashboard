import "server-only";
import { personalClient, personalConfigured } from "../supabase/server";
import { frengleClient, frengleConfigured } from "../supabase/frengle";
import { authenticateWorkspace } from "../workspace-access";

export { WorkspaceAccessError } from "../workspace-access";

export function workspaceSession(params: URLSearchParams) {
  return authenticateWorkspace(params, {
    PERSONAL: { configured: personalConfigured, client: personalClient },
    FRENGLE: { configured: frengleConfigured, client: frengleClient },
  });
}
