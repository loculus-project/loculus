package org.loculus.backend.service.scheduler

import java.util.concurrent.TimeUnit

@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class TaskLock(val name: String, val intervalString: String, val timeUnit: TimeUnit = TimeUnit.SECONDS)
