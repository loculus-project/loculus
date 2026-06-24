# 13. Database Schema

The API proxy introduces no dedicated database tables.

It reads published configuration through `ConfigService`:

- organism configs provide organism `lapisUrl` values;
- instance config `views` provides view `lapisUrl` values;
- released organism listings drive the Swagger/Scalar spec selector.

The relevant persisted structures are documented in `../configuration-management/13_databaseSchema.md`.

