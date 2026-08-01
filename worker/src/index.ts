import { problem } from "./problem";

export default {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    return problem(404, "Not Found", `No route for ${path}.`, {});
  },
} satisfies ExportedHandler;
