import { Meta, StoryObj } from "@storybook/react";
import { createPageStory } from "../createPageStory";

const { PageStory } = createPageStory({
  pageId: "logout-confirm.ftl",
});

const meta = {
  title: "login/LogoutConfirm",
  component: PageStory,
} satisfies Meta<typeof PageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  render: () => <PageStory />,
};
