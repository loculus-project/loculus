# Context And Scope

Loculus already serves submission APIs from the backend and sequence-query APIs from LAPIS. This branch explores serving website-facing sequence queries through the backend as well.

The backend query API still delegates to LAPIS, but it can add information that only the backend knows. Group-specific authentication is the example used here because the backend has database access and understands submitting groups.
