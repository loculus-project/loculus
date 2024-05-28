import { Meta, StoryObj } from "@storybook/react";
import { createPageStory } from "../createPageStory";

const { PageStory } = createPageStory({
  pageId: "register-user-profile.ftl",
});

const meta = {
  title: "login/RegisterUserProfile",
  component: PageStory,
} satisfies Meta<typeof PageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSocialProviders: Story = {
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

export const WithRecaptcha: Story = {
  render: () => (
    <PageStory
      kcContext={{
        recaptchaRequired: true,
        recaptchaSiteKey: "your-site-key",
      }}
    />
  ),
};
