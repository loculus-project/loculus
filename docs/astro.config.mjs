import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  base: "/loculus/",
  integrations: [
    starlight({
      title: "Loculus",
      editLink: {
        baseUrl: "https://github.com/loculus-project/loculus/edit/main/docs/",
      },

      social: {
        github: "https://github.com/loculus-project/loculus",
      },
      sidebar: [
        {
          label: "Introduction",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "Glossary", link: "/introduction/glossary/" },
          ],
        },
        {
          label: "Guides",
          items: [
            // Each item here is one entry in the navigation menu.
            { label: "Getting started", link: "/guides/getting-started/" },
            { label: "User administration", link: "/guides/user-administration/" },
          ],
        },
      ],
    }),
  ],
});
