package org.loculus.backend.config

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.service.submission.SpooledStream
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.web.context.request.ServletWebRequest
import java.io.File
import java.util.concurrent.Callable

class ReleasedDataSpoolCleanupInterceptorTest {
    @Test
    fun `after completion closes a spool before transfer starts`() {
        var closeCount = 0
        val spooled = SpooledStream(File("unused"), 0) { closeCount++ }
        val request = MockHttpServletRequest().apply {
            setAttribute(RELEASED_DATA_SPOOL_ATTRIBUTE, spooled)
        }
        val interceptor = ReleasedDataSpoolCleanupInterceptor()

        interceptor.afterCompletion(request, MockHttpServletResponse(), Any(), null)
        interceptor.afterCompletion(request, MockHttpServletResponse(), Any(), null)
        spooled.close()

        assertThat(closeCount, `is`(1))
        assertThat(spooled.beginTransfer(), `is`(false))
    }

    @Test
    fun `after completion leaves a transferring spool open`() {
        var closeCount = 0
        val spooled = SpooledStream(File("unused"), 0) { closeCount++ }
        val request = MockHttpServletRequest().apply {
            setAttribute(RELEASED_DATA_SPOOL_ATTRIBUTE, spooled)
        }

        assertThat(spooled.beginTransfer(), `is`(true))
        val interceptor = ReleasedDataSpoolCleanupInterceptor()
        val webRequest = ServletWebRequest(request)
        val task = Callable { Unit }

        interceptor.handleTimeout(webRequest, task)
        interceptor.handleError(webRequest, task, RuntimeException("disconnected"))
        interceptor.postProcess(webRequest, task, Unit)
        interceptor.afterCompletion(webRequest, task)
        interceptor.afterCompletion(request, MockHttpServletResponse(), Any(), null)
        assertThat(closeCount, `is`(0))

        spooled.close()
        assertThat(closeCount, `is`(1))
    }

    @Test
    fun `async terminal callbacks close a spool before transfer starts`() {
        val interceptor = ReleasedDataSpoolCleanupInterceptor()
        val task = Callable { Unit }

        var timeoutCloseCount = 0
        val timeoutSpool = SpooledStream(File("unused"), 0) { timeoutCloseCount++ }
        interceptor.handleTimeout(webRequestFor(timeoutSpool), task)

        var errorCloseCount = 0
        val errorSpool = SpooledStream(File("unused"), 0) { errorCloseCount++ }
        interceptor.handleError(webRequestFor(errorSpool), task, RuntimeException("disconnected"))

        var postProcessCloseCount = 0
        val postProcessSpool = SpooledStream(File("unused"), 0) { postProcessCloseCount++ }
        interceptor.postProcess(webRequestFor(postProcessSpool), task, RuntimeException("rejected"))

        var completionCloseCount = 0
        val completionSpool = SpooledStream(File("unused"), 0) { completionCloseCount++ }
        interceptor.afterCompletion(webRequestFor(completionSpool), task)

        assertThat(timeoutCloseCount, `is`(1))
        assertThat(errorCloseCount, `is`(1))
        assertThat(postProcessCloseCount, `is`(1))
        assertThat(completionCloseCount, `is`(1))
        assertThat(timeoutSpool.beginTransfer(), `is`(false))
        assertThat(errorSpool.beginTransfer(), `is`(false))
        assertThat(postProcessSpool.beginTransfer(), `is`(false))
        assertThat(completionSpool.beginTransfer(), `is`(false))
    }

    private fun webRequestFor(spooled: SpooledStream) = ServletWebRequest(
        MockHttpServletRequest().apply {
            setAttribute(RELEASED_DATA_SPOOL_ATTRIBUTE, spooled)
        },
    )
}
