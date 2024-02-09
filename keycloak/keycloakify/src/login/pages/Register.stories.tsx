import { ComponentStory, ComponentMeta } from '@storybook/react';
import { createPageStory } from "../createPageStory";

const { PageStory } = createPageStory({
    pageId: "register.ftl"
});

export default {
    title: "register/Register",
    component: PageStory,
} as ComponentMeta<typeof PageStory>;

export const Default: ComponentStory<typeof PageStory> = () => <PageStory />;

export const WithoutEmailField: ComponentStory<typeof PageStory> = () => (
    <PageStory
        kcContext={{
            register: { email: false }
        }}
    />
);

export const WithoutPasswordField: ComponentStory<typeof PageStory> = () => (
    <PageStory
        kcContext={{
            passwordRequired: false
        }}
    />
);

export const WithRecaptcha: ComponentStory<typeof PageStory> = () => (
    <PageStory
        kcContext={{
            recaptchaRequired: true,
            recaptchaSiteKey: "your-recaptcha-site-key"
        }}
    />
);

export const WithPresetFirstName: ComponentStory<typeof PageStory> = () => (
    <PageStory
        kcContext={{
            register: { formData: { firstName: "John" } }
        }}
    />
);

export const WithPresetLastName: ComponentStory<typeof PageStory> = () => (
    <PageStory
        kcContext={{
            register: { formData: { lastName: "Doe" } }
        }}
    />
);

export const WithPresetEmail: ComponentStory<typeof PageStory> = () => (
    <PageStory
        kcContext={{
            register: { formData: { email: "johndoe@example.com" } }
        }}
    />
);

export const WithPresetUsername: ComponentStory<typeof PageStory> = () => (
    <PageStory
        kcContext={{
            register: { formData: { username: "johndoe" } }
        }}
    />
);

// Add more variations as needed...
