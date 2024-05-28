import { Meta, StoryObj } from "@storybook/react";
import { createPageStory } from "../createPageStory";

const { PageStory } = createPageStory({
  pageId: "login.ftl",
});

const meta = {
  title: "login/Login",
  component: PageStory,
} satisfies Meta<typeof PageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <PageStory
      kcContext={{
        social: {
          providers: [
            {
              providerId: "orcid",
              alias: "orcid",
              displayName: "ORCID",
              loginUrl: "https://orcid.org",
            },
          ],
        },
      }}
    />
  ),
};
