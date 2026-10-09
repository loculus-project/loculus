# Spooling investigations

We tried writing each `get-released-data` export to a temporary file before serving it, counting records while writing ([#6926](https://github.com/loculus-project/loculus/pull/6926)). Motivation: [#5198](https://github.com/loculus-project/loculus/issues/5198) (skip the count query) and [#3511](https://github.com/loculus-project/loculus/issues/3511) (aborts on large exports). Closed unmerged: it made the export about 3% slower and the complexity was not worth it.

Numbers (10k mpox sequences, 4.4 GB uncompressed export, 72 MB zstd, built jar, August 2026):

|                                        | main           | spool PR              |
| -------------------------------------- | -------------- | --------------------- |
| total time (zstd)                      | 17.6 s         | 18.1 s                |
| time to first byte                     | 0.55 s         | 18.0 s                |
| db transaction held open (slow client) | 84 s           | 16 s                  |
| 6 concurrent requests                  | all 6 at ~57 s | 4 at ~37 s, 2 got 503 |
| `X-Total-Records` / `Content-Length`   | can drift      | exact                 |

What we learned:

* The count that [#5198](https://github.com/loculus-project/loculus/issues/5198) reported as ~30 s now takes 12 to 15 ms, presumably fixed by the index and view work in migrations V1.23 and V1.24.
* The export is limited by the JVM (~12 s of zstd decompression and NDJSON serialization), not by PostgreSQL (~6 s).
* On main the read transaction stays open until the slowest client finishes downloading. Spooling scoped it to the query itself (84 s to 16 s) and made the count and length headers exact ([#2778](https://github.com/loculus-project/loculus/issues/2778)). The long transaction is probably behind the aborts in [#3511](https://github.com/loculus-project/loculus/issues/3511). The price was time to first byte going from 0.55 s to 18 s.

The branch `fix/get-released-data-single-pass-spool` is kept for reference.
