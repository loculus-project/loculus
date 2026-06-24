# 14. Config Schema

## Organism config

Each organism config may contain:

```yaml
lapisUrl: "http://loculus-lapis-service-west-nile:8080"
```

The backend query proxy returns `404` if a query key resolves to an organism without a `lapisUrl`.

## View config

Each view config may contain:

```yaml
displayName: "Overview"
lapisUrl: "http://loculus-lapis-service-overview:8080"
query: "..."
schema: "..."
```

The query proxy uses only `lapisUrl` and `displayName`; the view materialization pipeline uses `query` and `schema`.

