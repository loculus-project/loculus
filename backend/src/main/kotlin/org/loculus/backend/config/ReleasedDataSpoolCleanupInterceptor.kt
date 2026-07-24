package org.loculus.backend.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.loculus.backend.service.submission.SpooledStream
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.context.request.RequestAttributes
import org.springframework.web.context.request.async.CallableProcessingInterceptor
import org.springframework.web.servlet.HandlerInterceptor
import java.util.concurrent.Callable

internal const val RELEASED_DATA_SPOOL_ATTRIBUTE = "org.loculus.backend.releasedDataSpool"

internal class ReleasedDataSpoolCleanupInterceptor :
    HandlerInterceptor,
    CallableProcessingInterceptor {
    override fun afterCompletion(
        request: HttpServletRequest,
        response: HttpServletResponse,
        handler: Any,
        ex: Exception?,
    ) {
        closeReadySpool(request.getAttribute(RELEASED_DATA_SPOOL_ATTRIBUTE))
    }

    override fun <T> postProcess(request: NativeWebRequest, task: Callable<T>, concurrentResult: Any?) {
        closeReadySpool(request.getAttribute(RELEASED_DATA_SPOOL_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST))
    }

    override fun <T> handleTimeout(request: NativeWebRequest, task: Callable<T>): Any {
        closeReadySpool(request.getAttribute(RELEASED_DATA_SPOOL_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST))
        return CallableProcessingInterceptor.RESULT_NONE
    }

    override fun <T> handleError(request: NativeWebRequest, task: Callable<T>, throwable: Throwable): Any {
        closeReadySpool(request.getAttribute(RELEASED_DATA_SPOOL_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST))
        return CallableProcessingInterceptor.RESULT_NONE
    }

    override fun <T> afterCompletion(request: NativeWebRequest, task: Callable<T>) {
        closeReadySpool(request.getAttribute(RELEASED_DATA_SPOOL_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST))
    }

    private fun closeReadySpool(attribute: Any?) {
        (attribute as? SpooledStream)?.closeIfTransferNotStarted()
    }
}
