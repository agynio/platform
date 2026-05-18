import { getAllDocRoutes, getDocPage } from "../lib/docs/pages";
import { getNavigation } from "../lib/docs/navigation";

async function validateDocs() {
  const routes = await getAllDocRoutes();

  await Promise.all(
    routes.map(async (route) => {
      await getDocPage(route.slug);
    }),
  );

  await getNavigation();

  if (routes.length === 0) {
    throw new Error("No docs pages found");
  }

  console.log(`Validated ${routes.length} docs pages`);
}

validateDocs().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
