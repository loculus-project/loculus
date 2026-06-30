import z from 'zod';

export const userProfile = z.object({
    username: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    emailDomain: z.string(),
    university: z.string().nullish(),
});
export type UserProfile = z.infer<typeof userProfile>;
