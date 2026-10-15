import type { Environment } from "./adapters/environment";
import { handleRequest } from "./http";

export { BankingCore } from "./adapters/container";

export default {
  fetch(request: Request, env: Environment): Promise<Response> {
    return new URL(request.url).pathname.startsWith("/api/")
      ? handleRequest(request, env)
      : env.ASSETS.fetch(request);
  },
};
