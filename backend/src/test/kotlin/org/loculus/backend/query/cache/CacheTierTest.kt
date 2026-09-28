package org.loculus.backend.query.cache

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.closeTo
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.instanceOf
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test

fun tierEntry(id: String, costMs: Double, size: Long, frequency: Int = 1, organism: String = "o", token: String = "t") =
    TierEntry(
        CacheKey(organism, token, id),
        CachedResponse(emptyList(), WireCodec.IDENTITY, null, size),
        Payload.Memory(ByteArray(0)),
        MissCost(costMs),
        costMs,
        size,
        frequency,
        createdAtMs = 0,
    )

class CacheTierTest {
    @Test
    fun `below budget everything admissible is admitted and the threshold is 0`() {
        val tier = CacheTier("t", budgetBytes = 3_000_000, maxEntryBytes = 1_000_000)
        assertThat(tier.admit(tierEntry("a", 1.0, 1_000_000)), instanceOf(Admission.Admitted::class.java))
        assertThat(tier.threshold(), equalTo(0.0))
        assertThat((tier.admit(tierEntry("big", 100.0, 1_000_001)) as Admission.Rejected).reason, equalTo("too_large"))
    }

    @Test
    fun `a full tier evicts the lowest priority, and the weakest entry is the threshold`() {
        val tier = CacheTier("t", budgetBytes = 3_000_000, maxEntryBytes = 1_000_000)
        // priority = frequency x ms / MB: 1, 5, 10
        tier.admit(tierEntry("cheap", 1.0, 1_000_000))
        tier.admit(tierEntry("mid", 5.0, 1_000_000))
        tier.admit(tierEntry("dear", 10.0, 1_000_000))
        assertThat(tier.threshold(), closeTo(1.0, 1e-9))

        val rejected = tier.admit(tierEntry("weak", 0.5, 1_000_000))
        assertThat((rejected as Admission.Rejected).reason, equalTo("below_threshold"))

        val admitted = tier.admit(tierEntry("strong", 3.0, 1_000_000)) as Admission.Admitted
        assertThat(admitted.evicted.map { it.key.requestHash }, equalTo(listOf("cheap")))
        assertThat(tier.peek(CacheKey("o", "t", "cheap")), nullValue())
        // GDSF aging: new entries start at L = the evicted priority
        assertThat(tier.priorityOf(1, 1.0, 1_000_000), closeTo(2.0, 1e-9))
        // the newcomer was ranked before L rose: it is now the weakest
        assertThat(tier.threshold(), closeTo(3.0, 1e-9))
        assertThat(tier.usedBytes(), equalTo(3_000_000L))
    }

    @Test
    fun `small cheap entries lose to a dense expensive one only when all of them are weaker`() {
        val tier = CacheTier("t", budgetBytes = 2_000_000, maxEntryBytes = 2_000_000)
        tier.admit(tierEntry("a", 1.0, 1_000_000))
        tier.admit(tierEntry("b", 50.0, 1_000_000))
        // needs both slots; b is stronger than the candidate, so nothing is evicted
        assertThat(tier.admit(tierEntry("c", 20.0, 2_000_000)), instanceOf(Admission.Rejected::class.java))
        assertThat(tier.size(), equalTo(2))
        val evicted = (tier.admit(tierEntry("d", 200.0, 2_000_000)) as Admission.Admitted).evicted
        assertThat(evicted.map { it.key.requestHash }, equalTo(listOf("a", "b")))
        assertThat(tier.usedBytes(), equalTo(2_000_000L))
    }

    @Test
    fun `hits raise the priority`() {
        val tier = CacheTier("t", budgetBytes = 2_000_000, maxEntryBytes = 1_000_000)
        tier.admit(tierEntry("a", 1.0, 1_000_000))
        tier.admit(tierEntry("b", 2.0, 1_000_000))
        repeat(3) { tier.hit(CacheKey("o", "t", "a")) }
        // a: 4 x 1 = 4 > b: 2, so b goes first
        val evicted = (tier.admit(tierEntry("c", 3.0, 1_000_000)) as Admission.Admitted).evicted
        assertThat(evicted.map { it.key.requestHash }, equalTo(listOf("b")))
    }

    @Test
    fun `stale tokens and old entries are dropped per organism`() {
        val tier = CacheTier("t", budgetBytes = 10_000_000, maxEntryBytes = 1_000_000)
        tier.admit(tierEntry("a", 1.0, 1000, token = "old"))
        tier.admit(tierEntry("b", 1.0, 1000, token = "new"))
        tier.admit(tierEntry("c", 1.0, 1000, organism = "other", token = "old"))
        assertThat(tier.dropStale("o", "new").map { it.key.requestHash }, equalTo(listOf("a")))
        assertThat(tier.size(), equalTo(2))
        assertThat(tier.usedBytes(), equalTo(2000L))
    }
}
