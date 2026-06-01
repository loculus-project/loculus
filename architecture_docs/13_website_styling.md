# Styling Guide

## The preferred approach: Tailwind

We take a Tailwind-based approach to styling. The core idea is that styling lives next to the markup it applies to, rather than in separate stylesheets that drift out of sync with the components they describe.

In practice this means three things, in order of preference.

**Couple the CSS to the code with Tailwind classes.** Apply utility classes directly to elements. This keeps the styling and the structure in one place, so a component is fully described by reading its own source. Reach for this first; most UI needs nothing more.

**Use Headless UI when the design is more complex.** When you need behaviour that goes beyond static markup — accessible dropdowns, modals, comboboxes, tabs, and similar interactive primitives — use [Headless UI](https://headlessui.com/) rather than reinventing the accessibility and state handling yourself. Headless UI gives you the unstyled, accessible behaviour, and you style it with Tailwind classes as usual. This pairing covers the large majority of complex cases.

**Achieve uniformity by creating a shared component.** When the same styled element appears in several places and you want it to stay consistent, do not copy the class list around. Extract a shared component (for example a `Button` or `Card`) that owns the Tailwind classes in one place. Uniformity comes from reuse of components, not from a global stylesheet or a shared CSS class. If a pattern changes, you change it once.

The rule of thumb: Tailwind classes by default, Headless UI for interactive complexity, and a shared component whenever you need the same thing to look the same in more than one place.

## Other libraries we currently use

We still depend on a few other styling and component libraries from earlier in the project's life. All of them are on a path away from, not toward. New work should avoid them where possible, and the notes below explain the specific reasons for each.

**MUI — deprecated, do not use.** MUI is being deprecated and should not be used in new code. The main reason is that it plays badly with server-side rendering (SSR), which causes problems for us. Do not introduce new MUI components, and prefer migrating existing ones to the Tailwind approach when you touch them.

**Daisy UI — avoid.** In Theo's view, Daisy UI causes confusion, and the recommendation is to deprecate and avoid it. Treat it the same as MUI for new work: don't add it, and lean toward removing it where practical.

**Flowbite — minimise.** We use Flowbite for cases where we didn't have a ready alternative and the only other option was MUI — which we avoid because of its SSR issues. Flowbite is therefore a stopgap rather than a recommendation. Keep its use to a minimum, and prefer building with Tailwind, Headless UI, or a shared component when a viable alternative exists.

## Summary

Default to Tailwind utility classes coupled to your markup. Use Headless UI for complex, interactive, accessible components. Create a shared component whenever you need consistency across the codebase. Avoid MUI and Daisy UI in new code, and keep Flowbite to a minimum.
