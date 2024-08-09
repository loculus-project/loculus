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
      customCss: [
        "./src/styles/custom.css",
      ],
      social: {
        github: "https://github.com/loculus-project/loculus",
      },
      sidebar: [
        {
          label: "Introduction",
          items: [
            { label: "What is Loculus?", link: "/introduction/what-is-loculus/" },
            { label: "Glossary", link: "/introduction/glossary/" },
            { label: "System overview", link: "/introduction/system-overview/" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Getting started", link: "/guides/getting-started/" },
            { label: "User administration", link: "/guides/user-administration/" },
          ],
        },
        {
          label: "Reference",
          autogenerate: { directory: "reference" },
        },
      ],
    }),
  ],
});
